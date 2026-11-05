import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

const usage = { count: 0 as number, error: null as unknown };
const usageQuery = { select: () => usageQuery, eq: () => usageQuery, gte: async () => usage };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => usageQuery } }));
vi.mock("@/lib/entitlement.server", () => ({ assertOrgEntitled: vi.fn(async () => undefined) }));
const generate = vi.fn();
vi.mock("@/lib/ai/router.server", () => ({ generateStructuredOutput: (...args: unknown[]) => generate(...args) }));

import { extractPdfPages, readIngestDocument } from "./doc-ingest.server";

const ORG = "11111111-2222-4333-8444-555555555555";
const PATH = `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf`;

async function pdf(pages: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) doc.addPage().drawText(text, { x: 50, y: 700, size: 14, font });
  return doc.save();
}

function fakeSupabase(bytes: Uint8Array) {
  const calls: string[] = [];
  const bucket = {
    download: vi.fn(async (p: string) => (calls.push(`download ${p}`), { data: new Blob([bytes as unknown as BlobPart]), error: null })),
    remove: vi.fn(async (p: string[]) => (calls.push(`remove ${p[0]}`), { data: [], error: null })),
  };
  const client = {
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => {
      throw new Error("no table access expected");
    }),
  };
  return { client: client as never, calls };
}

describe("B12-7 readIngestDocument", () => {
  it("reads a PDF per page with unpdf", async () => {
    expect(await extractPdfPages(await pdf(["Haircut $35", "Beard trim $20"]))).toEqual(["Haircut $35", "Beard trim $20"]);
  });

  it("proposes cited services, writes no tables, deletes the upload", async () => {
    const { client, calls } = fakeSupabase(await pdf(["Haircut $35", "Beard trim $20"]));
    generate.mockResolvedValueOnce({
      data: { items: [{ name: "Haircut", priceText: "$35", where: "page 1" }, { name: "Facial", priceText: "$50", where: "page 2" }] },
    });
    const out = await readIngestDocument(client, "u1", { organizationId: ORG, path: PATH, fileName: "menu.pdf", mimeType: "application/pdf" });
    expect(out.pages.map((p) => p.where)).toEqual(["page 1", "page 2"]);
    expect(out.proposals).toEqual([
      { name: "Haircut", priceText: "$35", price: 35, startingPrice: false, description: "", file: "menu.pdf", where: "page 1" },
    ]);
    expect(calls).toEqual([`download ${PATH}`, `remove ${PATH}`]);
    expect(generate.mock.calls[0]![0]).toMatchObject({ task: "services.doc_ingest" });
  });

  it("refuses paths outside the caller's org", async () => {
    const { client } = fakeSupabase(new Uint8Array());
    await expect(
      readIngestDocument(client, "u1", {
        organizationId: "99999999-2222-4333-8444-555555555555",
        path: PATH,
        fileName: "menu.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/isn't in your workspace/);
  });

  it("enforces the monthly read cap and still deletes the upload", async () => {
    usage.count = 40;
    const { client, calls } = fakeSupabase(await pdf(["Haircut $35"]));
    generate.mockClear();
    await expect(
      readIngestDocument(client, "u1", { organizationId: ORG, path: PATH, fileName: "menu.pdf", mimeType: "application/pdf" }),
    ).rejects.toThrow(/last 30 days/);
    expect(calls).toEqual([`download ${PATH}`, `remove ${PATH}`]);
    expect(generate).not.toHaveBeenCalled();
    usage.count = 0;
  });

  it("never writes services or memory (static check)", () => {
    const src = readFileSync(new URL("./doc-ingest.server.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(src).not.toMatch(/from "[^"]*(memory|planner)[^"]*"|import\("[^"]*(memory|planner)/i);
  });
});
