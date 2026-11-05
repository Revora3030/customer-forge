/**
 * COMP-3: the "N changes" bar. Quick text edits made in the preview collect
 * here; nothing is written until Save, and Save writes them all at once as a
 * single restorable version. Discard puts the preview back as it was saved.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { batchLabel, describeEdit, type PendingEdit } from "@/lib/builder/batch-edits";

type Props = {
  edits: readonly PendingEdit[];
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
};

export function PendingEditsBar({ edits, saving, onSave, onDiscard }: Props) {
  const [open, setOpen] = useState(false);
  if (!edits.length) return null;
  return (
    <div
      className="mx-auto mb-2 max-w-xl rounded-lg border border-primary/40 bg-background/95 p-2 text-[12px] shadow-sm"
      role="region"
      aria-label="Unsaved changes"
      data-testid="pending-edits-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 px-2 font-medium"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          data-testid="pending-edits-count"
        >
          {batchLabel(edits.length)} not saved
        </Button>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onDiscard} disabled={saving} data-testid="pending-edits-discard">
          Discard
        </Button>
        <Button type="button" size="sm" variant="signal" className="min-h-11" onClick={onSave} disabled={saving} data-testid="pending-edits-save">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {open ? (
        <ul className="mt-1 space-y-1 border-t border-border pt-1.5" data-testid="pending-edits-list">
          {edits.map((edit) => (
            <li key={`${edit.sectionId}-${edit.path}`} className="break-words text-muted-foreground">
              {describeEdit(edit)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
