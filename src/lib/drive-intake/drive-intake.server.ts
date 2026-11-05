/**
 * Server side of Drive photo intake. Drive is read through the workspace
 * connector gateway (same pattern as google.server.ts), so Google
 * credentials never reach the browser. The owner shares their folder with
 * the connected Google account; Revora only reads image files in it and
 * copies them into the tenant's private media bucket as owner photos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/media";
import { drivePhotoPath, planDriveImport, type DriveFile, type DriveSkip } from "./drive-intake";

const GATEWAY = "https://connector-gateway.lovable.dev";

export class DriveIntakeError extends Error {
  constructor(
    message: string,
    readonly failure: "needs_connection" | "no_access" | "provider_error",
  ) {
    super(message);
    this.name = "DriveIntakeError";
  }
}

function headers() {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionApiKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableApiKey || !connectionApiKey)
    throw new DriveIntakeError(
      "Google Drive isn't connected to Revora yet, so photos can't be read from a folder.",
      "needs_connection",
    );
  return { Authorization: `Bearer ${lovableApiKey}`, "X-Connection-Api-Key": connectionApiKey };
}

async function driveFetch(path: string, fetchImpl: typeof fetch): Promise<Response> {
  const res = await fetchImpl(`${GATEWAY}/google_drive${path}`, { headers: headers() });
  if (res.status === 403 || res.status === 404)
    throw new DriveIntakeError(
      "Revora can't open that folder. Share it with Revora's Google account (Viewer is enough), then try again.",
      "no_access",
    );
  if (!res.ok)
    throw new DriveIntakeError(`Google Drive couldn't answer (${res.status}).`, "provider_error");
  return res;
}

export async function listDriveFolder(
  folderId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await driveFetch(
      `/drive/v3/files?q=${q}&pageSize=200&fields=nextPageToken,files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      fetchImpl,
    );
    const body = (await res.json()) as {
      nextPageToken?: string;
      files?: Array<{ id?: unknown; name?: unknown; mimeType?: unknown; size?: unknown }>;
    };
    for (const f of body.files ?? []) {
      if (typeof f.id !== "string" || typeof f.mimeType !== "string") continue;
      if (f.mimeType === "application/vnd.google-apps.folder") continue;
      const size = Number(f.size);
      files.push({
        id: f.id,
        name: String(f.name ?? "photo").slice(0, 120),
        mimeType: f.mimeType,
        size: Number.isFinite(size) ? size : null,
      });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return files;
}

export type DriveImportResult = {
  imported: number;
  skipped: DriveSkip[];
  failed: string[];
  remaining: number;
  found: number;
};

export async function importDriveFolder(
  db: SupabaseClient,
  organizationId: string,
  folderId: string,
  category: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DriveImportResult> {
  const files = await listDriveFolder(folderId, fetchImpl);
  const existing = await db
    .from("media")
    .select("url")
    .eq("organization_id", organizationId)
    .like("url", `${organizationId}/drive-%`);
  if (existing.error)
    throw new DriveIntakeError("Couldn't read your photo library.", "provider_error");
  const paths = new Set((existing.data ?? []).map((r: { url: string }) => r.url));
  const plan = planDriveImport(organizationId, files, paths);

  let imported = 0;
  const failed: string[] = [];
  for (const file of plan.toImport) {
    try {
      const res = await driveFetch(
        `/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,
        fetchImpl,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        plan.skipped.push({ name: file.name, reason: "too_large" });
        continue;
      }
      const path = drivePhotoPath(organizationId, file);
      const up = await db.storage
        .from(MEDIA_BUCKET)
        .upload(path, bytes, { contentType: file.mimeType, upsert: true });
      if (up.error) throw up.error;
      const row = await db.from("media").insert({
        organization_id: organizationId,
        url: path,
        category,
        file_name: file.name,
        size_bytes: bytes.byteLength,
        alt_text: null,
        source: "owner",
      } as never);
      if (row.error) {
        await db.storage.from(MEDIA_BUCKET).remove([path]);
        throw row.error;
      }
      imported++;
    } catch {
      failed.push(file.name);
    }
  }
  return {
    imported,
    skipped: plan.skipped,
    failed,
    remaining: plan.remaining,
    found: files.length,
  };
}
