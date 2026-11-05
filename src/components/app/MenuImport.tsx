/**
 * B12-7 "Import from your menu": upload a PDF, photo or CSV of your menu or
 * price sheet. Revora shows exactly what it read, then PROPOSES services, each
 * citing its file and page. Nothing is saved or shown on the website until the
 * owner ticks the ones that are right and presses Add.
 */
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { supabase } from "@/integrations/supabase/client";
import { readMenuDocument } from "@/lib/doc-ingest/doc-ingest.functions";
import {
  ACCEPTED_TYPES,
  INGEST_BUCKET,
  MAX_FILE_BYTES,
  ingestKind,
  ingestPath,
  type IngestPreview,
  type ProposedService,
} from "@/lib/doc-ingest/doc-ingest";
import { friendlyError } from "@/lib/user-error";

export function MenuImportView({
  preview,
  selected,
  busy,
  message,
  onPick,
  onToggle,
  onAdd,
  onReset,
}: {
  preview: IngestPreview | null;
  selected: Set<number>;
  busy: boolean;
  message: string | null;
  onPick: () => void;
  onToggle: (index: number) => void;
  onAdd: () => void;
  onReset: () => void;
}) {
  return (
    <Panel className="p-5" data-testid="menu-import">
      <SectionHeading eyebrow="Import" title="Add services from your menu" />
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        Upload a PDF, a photo of your menu, or a CSV price sheet (up to 5 MB). You'll see what Revora read and a list of
        suggested services with where each came from. Nothing is saved or shown on your website until you tick it and press Add.
      </p>
      {message ? (
        <p role="status" className="mt-3 text-[13px] text-muted-foreground">
          {message}
        </p>
      ) : null}
      {!preview ? (
        <Button className="mt-4" variant="signal" onClick={onPick} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
          {busy ? "Reading your file…" : "Upload menu or price sheet"}
        </Button>
      ) : (
        <div className="mt-4 space-y-4">
          <details className="rounded-lg border border-border bg-elevated p-3" data-testid="menu-import-read">
            <summary className="cursor-pointer text-[13px] font-medium">What Revora read from {preview.fileName}</summary>
            {preview.table ? (
              <div className="mt-2 max-h-64 overflow-auto">
                <table className="w-full text-left text-[12px]" data-testid="menu-import-table">
                  <tbody>
                    {preview.table.slice(0, 50).map((row, r) => (
                      <tr key={r} className={r === 0 ? "font-semibold" : undefined}>
                        {row.map((cell, c) => (
                          <td key={c} className="border-b border-border px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              preview.pages.map((page) => (
                <div key={page.where} className="mt-2">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">{page.where}</p>
                  <pre className="max-h-48 overflow-auto text-[12px] whitespace-pre-wrap">{page.text}</pre>
                </div>
              ))
            )}
          </details>
          {preview.note ? <p className="text-[13px] text-muted-foreground">{preview.note}</p> : null}
          {preview.proposals.length ? (
            <ul className="space-y-2" aria-label="Suggested services">
              {preview.proposals.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Checkbox
                    id={`menu-import-${index}`}
                    checked={selected.has(index)}
                    onCheckedChange={() => onToggle(index)}
                    aria-label={`Add ${item.name}`}
                  />
                  <label htmlFor={`menu-import-${index}`} className="flex-1 text-[13px]">
                    <span className="font-medium">{item.name}</span>
                    <span className="ml-2 text-muted-foreground">{item.priceText || "No price in the file"}</span>
                    {item.description ? <span className="block text-muted-foreground">{item.description}</span> : null}
                    <span className="block text-xs text-muted-foreground" data-testid="menu-import-source">
                      From {item.file}, {item.where}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            {preview.proposals.length ? (
              <Button variant="signal" onClick={onAdd} disabled={busy || selected.size === 0}>
                {busy ? "Adding…" : `Add ${selected.size} service${selected.size === 1 ? "" : "s"}`}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onReset} disabled={busy}>
              {preview.proposals.length ? "Discard" : "Try another file"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function MenuImport({
  organizationId,
  onAdd,
}: {
  organizationId: string;
  onAdd: (items: ProposedService[]) => Promise<void>;
}) {
  const read = useServerFn(readMenuDocument);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    const kind = ingestKind(file.type, file.name);
    if (!kind) return setMessage("Upload a PDF, a photo (JPG, PNG, WebP) or a CSV.");
    if (file.size > MAX_FILE_BYTES) return setMessage("That file is over 5 MB.");
    setBusy(true);
    setMessage(null);
    try {
      const path = ingestPath(organizationId, crypto.randomUUID(), kind.ext);
      const uploaded = await supabase.storage.from(INGEST_BUCKET).upload(path, file, { contentType: kind.mime, upsert: false });
      if (uploaded.error) throw uploaded.error;
      const result = await read({ data: { organizationId, path, fileName: file.name, mimeType: kind.mime } });
      setPreview(result);
      // Nothing is pre-ticked: the owner chooses.
      setSelected(new Set());
    } catch (error) {
      setMessage(friendlyError(error as Error, "That file couldn't be read."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={`${ACCEPTED_TYPES},.csv`}
        className="sr-only"
        aria-label="Menu or price sheet file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <MenuImportView
        preview={preview}
        selected={selected}
        busy={busy}
        message={message}
        onPick={() => input.current?.click()}
        onToggle={(index) =>
          setSelected((current) => {
            const next = new Set(current);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
          })
        }
        onAdd={async () => {
          if (!preview) return;
          setBusy(true);
          try {
            await onAdd(preview.proposals.filter((_, index) => selected.has(index)));
            setPreview(null);
            setSelected(new Set());
            setMessage("Added. Edit any service below to set its time or details.");
          } catch (error) {
            setMessage(friendlyError(error as Error, "Some services couldn't be added."));
          } finally {
            setBusy(false);
          }
        }}
        onReset={() => {
          setPreview(null);
          setSelected(new Set());
          setMessage(null);
        }}
      />
    </>
  );
}
