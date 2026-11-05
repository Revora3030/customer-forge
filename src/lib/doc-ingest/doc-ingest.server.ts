/**
 * B12-7 server path: read one uploaded menu/price sheet and return a preview
 * plus PROPOSED services. Writes nothing to services or memory; the owner
 * confirms proposals in the app. The uploaded file is deleted after reading.
 * unpdf (MIT) is lazy-imported here only, so it never loads elsewhere.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  INGEST_BUCKET,
  MAX_FILE_BYTES,
  MAX_PAGES,
  PARSE_TIMEOUT_MS,
  clampPages,
  imageMessages,
  ingestKind,
  ingestMessages,
  parseCsv,
  pathBelongsTo,
  tablePages,
  verifyProposals,
  withTimeout,
  type IngestPage,
  type IngestPreview,
} from "@/lib/doc-ingest/doc-ingest";

export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  return withTimeout(
    (async () => {
      const pdf = await getDocumentProxy(bytes);
      if (pdf.numPages > MAX_PAGES * 5) throw new Error(`That PDF has ${pdf.numPages} pages. Upload just the menu pages.`);
      const { text } = await extractText(pdf, { mergePages: false });
      return text.slice(0, MAX_PAGES);
    })(),
    PARSE_TIMEOUT_MS,
    "That PDF took too long to read. Try a smaller file or a photo of the menu.",
  );
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function readIngestDocument(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: { organizationId: string; path: string; fileName: string; mimeType: string },
): Promise<IngestPreview> {
  const orgId = data.organizationId;
  if (!pathBelongsTo(data.path, orgId)) throw new Error("That file isn't in your workspace.");
  const kind = ingestKind(data.mimeType, data.fileName);
  if (!kind) throw new Error("Upload a PDF, a photo (JPG, PNG, WebP) or a CSV.");
  const { assertOrgEntitled } = await import("@/lib/entitlement.server");
  await assertOrgEntitled(supabase, orgId);

  // Storage RLS: only managers of this org can read its folder.
  const storage = supabase.storage.from(INGEST_BUCKET);
  const downloaded = await storage.download(data.path);
  // One-shot: the file is never kept after it's read.
  await storage.remove([data.path]).catch(() => undefined);
  if (downloaded.error || !downloaded.data) throw new Error("That file couldn't be read. Upload it again.");
  if (downloaded.data.size > MAX_FILE_BYTES) throw new Error("That file is over 5 MB.");
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const fileName = data.fileName.slice(0, 120);
  const caller = { organizationId: orgId, userId, task: "services.doc_ingest" };
  const { generateStructuredOutput } = await import("@/lib/ai/router.server");

  let pages: IngestPage[] = [];
  let table: string[][] | null = null;
  let raw: unknown = null;
  if (kind.kind === "image") {
    const dataUrl = `data:${kind.mime};base64,${toBase64(bytes)}`;
    const result = await withTimeout(
      generateStructuredOutput(caller, { role: "vision", maxOutputTokens: 2500, messages: imageMessages(fileName, dataUrl, kind.mime) }),
      45000,
      "Reading that photo took too long. Try again.",
    );
    raw = result.data;
    const text = typeof (raw as { text?: unknown })?.text === "string" ? (raw as { text: string }).text : "";
    pages = clampPages([text], () => "image");
  } else {
    if (kind.kind === "pdf") pages = clampPages(await extractPdfPages(bytes), (i) => `page ${i + 1}`);
    else {
      const text = new TextDecoder().decode(bytes);
      if (kind.kind === "table") {
        table = parseCsv(text);
        pages = tablePages(table);
      } else pages = clampPages([text], () => "page 1");
    }
    if (pages.length) {
      const result = await withTimeout(
        generateStructuredOutput(caller, { role: "fast", maxOutputTokens: 2500, messages: ingestMessages(fileName, pages) }),
        45000,
        "Reading that file took too long. Try again.",
      );
      raw = result.data;
    }
  }

  const proposals = pages.length ? verifyProposals(raw, fileName, pages) : [];
  const note = !pages.length
    ? kind.kind === "pdf"
      ? "No readable text in that PDF (it may be a scan). Upload a photo of the menu instead."
      : "Nothing readable was found in that file."
    : proposals.length
      ? null
      : "No services with names from the file were found. Nothing was added.";
  return { fileName, kind: kind.kind, pages, table, proposals, note };
}
