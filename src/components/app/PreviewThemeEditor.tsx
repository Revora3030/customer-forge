/**
 * PREVIEW THEME EDITOR: the palette picker inside the builder's preview toolbar.
 *
 * Pick a preset or a custom main colour and the preview repaints at once (the
 * page's own CSS variables, nothing saved). Save writes the site's three brand
 * colours through the same business-profile columns the assistant already uses;
 * Cancel puts the saved look straight back; Reset discards this session's
 * choices but keeps the panel open. Only an owner, admin or manager can save,
 * and the server checks that again. Colours that would fail WCAG AA get a plain
 * warning; the owner still decides.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette as PaletteIcon, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/lib/ui/notify";
import { cn } from "@/lib/utils";
import { getSiteThemeColors, saveSiteThemeColors, type SiteThemeState } from "@/lib/builder/site-theme.functions";
import {
  PALETTE_PRESETS,
  matchingPreset,
  normalizeHex,
  paletteWarnings,
  samePalette,
  type Palette,
} from "@/lib/builder/palette-edit";

type Props = {
  organizationId: string;
  /** Show this palette live in the preview; null puts the saved look back. */
  onPreview: (palette: Palette | null) => void;
  /** Called once colours were saved, so the preview can reload the saved site. */
  onSaved: (palette: Palette) => void;
};

export function PreviewThemeEditor({ organizationId, onPreview, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Palette | null>(null);
  const [hexText, setHexText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useServerFn(getSiteThemeColors);
  const save = useServerFn(saveSiteThemeColors);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["site-theme-colors", organizationId], [organizationId]);
  const theme = useQuery({ queryKey, enabled: open, staleTime: 0, queryFn: () => load({ data: { organizationId } }) });
  const saved = theme.data?.palette ?? null;
  const canEdit = theme.data?.canEdit ?? false;
  const current = draft ?? saved;
  const changed = Boolean(draft && saved && !samePalette(draft, saved));
  const warnings = useMemo(() => (current ? paletteWarnings(current) : []), [current]);
  const preset = matchingPreset(current);
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;

  // Nothing is left half-applied if the panel unmounts mid-edit.
  const dirtyRef = useRef(false);
  dirtyRef.current = changed;
  useEffect(() => () => {
    if (dirtyRef.current) previewRef.current(null);
  }, []);

  const choose = (next: Palette) => {
    setDraft(next);
    setHexText(null);
    previewRef.current(next);
  };

  const discard = () => {
    setDraft(null);
    setHexText(null);
    previewRef.current(null);
  };

  const onOpenChange = (next: boolean) => {
    // Closing without saving is Cancel: the preview goes back to the saved look.
    if (!next && changed) discard();
    if (!next) {
      setDraft(null);
      setHexText(null);
    }
    setOpen(next);
  };

  const setPrimary = (value: string) => {
    if (!saved) return;
    setHexText(value);
    const hex = normalizeHex(value);
    if (hex) {
      const next = { ...(draft ?? saved), primary: hex };
      setDraft(next);
      previewRef.current(next);
    }
  };

  const onSave = async () => {
    if (!draft || !changed) return;
    setSaving(true);
    try {
      const result = await save({ data: { organizationId, primary: draft.primary, secondary: draft.secondary, accent: draft.accent } });
      queryClient.setQueryData<SiteThemeState>(queryKey, (previous) => (previous ? { ...previous, palette: result.palette, unset: false } : previous));
      setDraft(null);
      setHexText(null);
      setOpen(false);
      onSaved(result.palette);
      toast.success("Colours saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save those colours.");
    } finally {
      setSaving(false);
    }
  };

  const hexInvalid = hexText !== null && hexText.trim() !== "" && !normalizeHex(hexText);
  const hexId = "preview-theme-hex";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant={open ? "secondary" : "ghost"}
          data-testid="builder-preview-colours"
          aria-label="Edit site colours"
          title="Try and save a colour palette"
        >
          <PaletteIcon className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3" aria-label="Site colours" data-testid="preview-theme-editor">
        <div>
          <h2 className="text-[13px] font-semibold">Site colours</h2>
          <p className="text-[11.5px] text-muted-foreground">Try a look; the preview changes right away. Nothing is saved until you press Save.</p>
        </div>

        {theme.isLoading ? <p role="status" className="text-[12px] text-muted-foreground">Loading your colours…</p> : null}
        {theme.isError ? (
          <p role="alert" className="text-[12px] text-destructive">
            Couldn't load your colours.{" "}
            <button type="button" className="font-medium underline" onClick={() => void theme.refetch()}>Try again</button>
          </p>
        ) : null}

        {saved ? (
          <>
            {!canEdit ? (
              <p role="status" className="text-[12px] text-muted-foreground">Only the site owner or a manager can change colours. You can still look.</p>
            ) : null}
            {theme.data?.unset ? (
              <p className="text-[11.5px] text-muted-foreground">No colours are saved yet, so the site shows a plain look.</p>
            ) : null}

            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[12px] font-medium">Preset palettes</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {PALETTE_PRESETS.map((item) => {
                  const selected = preset?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => choose({ primary: item.primary, secondary: item.secondary, accent: item.accent })}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        selected ? "border-primary bg-primary/10" : "border-border hover:bg-elevated",
                      )}
                    >
                      <span className="flex shrink-0" aria-hidden>
                        {[item.secondary, item.primary, item.accent].map((color, index) => (
                          <span key={index} className="-ml-1 size-4 rounded-full border border-border first:ml-0" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      <span className="min-w-0 truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor={hexId} className="mb-1 block text-[12px] font-medium">Custom main colour</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick a custom main colour"
                  value={(current ?? saved).primary}
                  onChange={(event) => setPrimary(event.target.value)}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
                <input
                  id={hexId}
                  type="text"
                  inputMode="text"
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={hexInvalid}
                  aria-describedby={hexInvalid ? `${hexId}-error` : undefined}
                  value={hexText ?? (current ?? saved).primary}
                  onChange={(event) => setPrimary(event.target.value)}
                  className="h-9 w-28 rounded-md border border-border bg-background px-2 font-mono text-[12.5px]"
                />
              </div>
              {hexInvalid ? (
                <p id={`${hexId}-error`} role="alert" className="mt-1 text-[11.5px] text-destructive">Use a hex colour like #1d4ed8.</p>
              ) : null}
            </div>

            {warnings.length > 0 ? (
              <ul role="status" aria-live="polite" data-testid="preview-theme-warnings" className="space-y-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-[11.5px] text-foreground">
                {warnings.map((warning) => (
                  <li key={warning.id} className="flex gap-1.5">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button type="button" size="sm" variant="ghost" onClick={discard} disabled={!changed || saving}>
                <RotateCcw className="size-3.5" aria-hidden /> Reset
              </Button>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                <Button type="button" size="sm" variant="signal" onClick={() => void onSave()} disabled={!changed || !canEdit || saving} data-testid="preview-theme-save">
                  {saving ? "Saving…" : "Save colours"}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
