import { useState } from "react";
import { FolderDown, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { Button } from "@/components/ui/button";
import { importDrivePhotosFn } from "@/lib/drive-intake/drive-intake.functions";
import {
  driveShareAddress,
  driveIntakeEnabled,
  parseDriveFolderId,
} from "@/lib/drive-intake/drive-intake";

/** BIL-12: pull phone photos from a shared Google Drive folder into the library. */
export function DriveFolderImport({
  organizationId,
  category,
  onImported,
}: {
  organizationId: string;
  category: string;
  onImported: () => void;
}) {
  const run = useServerFn(importDrivePhotosFn);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const valid = parseDriveFolderId(folder) !== null;

  async function importNow() {
    setBusy(true);
    setSummary(null);
    try {
      const r = await run({ data: { organizationId, folder, category } });
      const count = (reason: string) => r.skipped.filter((s) => s.reason === reason).length;
      const parts = [`Imported ${r.imported} of ${r.found} file(s).`];
      if (count("already_imported"))
        parts.push(`${count("already_imported")} already in your library.`);
      if (count("unsupported_type"))
        parts.push(
          `${count("unsupported_type")} skipped (not JPG, PNG, WebP or AVIF — e.g. HEIC or video).`,
        );
      if (count("too_large")) parts.push(`${count("too_large")} too large.`);
      if (r.failed.length) parts.push(`${r.failed.length} couldn't be copied.`);
      if (r.remaining) parts.push(`${r.remaining} more waiting — press Import again.`);
      setSummary(parts.join(" "));
      if (r.imported) onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't import from Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  const shareWith = driveShareAddress(import.meta.env["VITE_REVORA_DRIVE_SHARE_EMAIL"]);
  if (!driveIntakeEnabled(import.meta.env["VITE_DRIVE_INTAKE_ENABLED"])) return null;

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <p className="text-[14px] font-medium">Import from a Google Drive folder</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {shareWith
          ? `Share the folder with ${shareWith} (Viewer access)`
          : "Ask your Revora admin which Google account to share the folder with (Viewer access)"}
        , paste its link, and Revora copies the photos into this library. Running it again only adds
        new photos.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="url"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          aria-label="Google Drive folder link"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-[13px]"
        />
        <Button
          type="button"
          variant="outline"
          disabled={!valid || busy}
          onClick={() => void importNow()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FolderDown className="size-4" aria-hidden="true" />
          )}
          {busy ? "Importing…" : "Import photos"}
        </Button>
      </div>
      {summary ? (
        <p role="status" className="mt-2 text-[12px] text-muted-foreground">
          {summary}
        </p>
      ) : null}
    </div>
  );
}
