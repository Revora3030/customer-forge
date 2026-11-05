import { useState } from "react";
import { Button } from "@/components/ui/button";
import { applySiteLook } from "@/lib/builder/site-look.functions";
import { nextLook } from "@/lib/builder/site-look";
import { announceDraftChange } from "@/lib/builder/preview-bridge";

/**
 * CG-07 "Try another look" for the owner's draft. Previewing changes only this
 * screen; nothing is saved until the owner presses "Use this look".
 */
export function AnotherLookBar(props: {
  organizationId: string;
  savedLook: number;
  previewLook: number | null;
  onPreview: (look: number | null) => void;
  onApplied: () => void;
}) {
  const { organizationId, savedLook, previewLook, onPreview, onApplied } = props;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showing = previewLook ?? savedLook;
  let candidate = nextLook(showing);
  if (candidate === savedLook && previewLook !== null) candidate = nextLook(candidate);

  const apply = async () => {
    if (previewLook === null) return;
    setSaving(true);
    setError(null);
    try {
      await applySiteLook({ data: { organizationId, look: previewLook } });
      announceDraftChange(organizationId, "another-look");
      onPreview(null);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the new look. Your site is unchanged.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="region" aria-label="Try another look" className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 text-[13px] backdrop-blur">
      <span className="font-medium">{previewLook === null ? "Want a different layout?" : "Previewing a new look"}</span>
      <span className="text-muted-foreground">
        Keeps your words, photos and colours. Free: no AI credits used. Sections with a custom AI design stay as they are.
      </span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onPreview(candidate)} disabled={saving}>
          Try another look
        </Button>
        {previewLook !== null ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onPreview(null)} disabled={saving}>
              Keep current
            </Button>
            <Button size="sm" variant="signal" onClick={apply} disabled={saving}>
              {saving ? "Saving…" : "Use this look"}
            </Button>
          </>
        ) : null}
      </span>
      {error ? <p role="alert" className="w-full text-destructive">{error}</p> : null}
    </div>
  );
}
