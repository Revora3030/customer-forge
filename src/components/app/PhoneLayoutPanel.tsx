import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSaveSection } from "@/lib/website-content.hooks";
import { sectionLabel, type ContentSection } from "@/lib/website-content";
import {
  LEAD_HIDE_REASON,
  guardPhoneLayout,
  hasPhoneChanges,
  isLeadSection,
  phoneMoveBlocked,
  phoneOrder,
  phoneState,
  planPhoneHidden,
  planPhoneMove,
  planPhoneReset,
  type SettingsPatch,
} from "@/lib/builder/phone-layout";
import { cn } from "@/lib/utils";

/**
 * Phone edit mode for the live builder: shown while the preview is phone-sized,
 * it lets the owner hide a section on phones and move sections up or down on
 * phones. Desktop and tablet are never touched: the choices are saved in each
 * section's phone style layer, which the site only applies at phone width.
 */
export function PhoneLayoutPanel({
  organizationId,
  sections,
  onSaved,
}: {
  organizationId: string | null;
  sections: ContentSection[];
  /** Called once after a change is saved, so the preview can reload. */
  onSaved: () => void;
}) {
  const save = useSaveSection(organizationId ?? undefined);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  // Guarded, so the list shows what phones really get: a saved "hide" on the
  // enquiry form or a saved order that buries it is ignored by the site too.
  const visible = useMemo(() => guardPhoneLayout(sections.filter((section) => section.is_visible)), [sections]);
  const ordered = useMemo(() => phoneOrder(visible), [visible]);

  if (!organizationId || visible.length < 1) return null;

  const commit = async (patches: SettingsPatch[]) => {
    if (!patches.length || busy) return;
    setBusy(true);
    try {
      await Promise.all(patches.map((patch) => save.mutateAsync({ id: patch.id, patch: { settings: patch.settings } })));
      onSaved();
    } catch {
      // useSaveSection already told the owner what failed.
    } finally {
      setBusy(false);
    }
  };

  const label = (section: ContentSection) => section.heading?.trim() || sectionLabel(section.kind);

  return (
    <div
      className="mx-auto mb-3 w-full max-w-xl rounded-lg border border-border bg-background/95 p-2 text-[12.5px] shadow-sm"
      data-testid="phone-layout-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left font-medium"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Smartphone className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Phone layout</span>
          <span className="truncate font-normal text-muted-foreground">· changes here affect phones only</span>
        </button>
        {hasPhoneChanges(visible) ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void commit(planPhoneReset(visible))}
            data-testid="phone-layout-reset"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Reset
          </Button>
        ) : null}
      </div>
      {open ? (
        <ol className="mt-2 space-y-1" aria-label="Sections in phone order">
          {ordered.map((section, index) => {
            const state = phoneState(section);
            const lead = isLeadSection(section);
            const upBlocked = index > 0 ? phoneMoveBlocked(visible, section.id, "up") : null;
            const downBlocked = index < ordered.length - 1 ? phoneMoveBlocked(visible, section.id, "down") : null;
            return (
              <li
                key={section.id}
                data-testid="phone-layout-row"
                data-section-id={section.id}
                data-hidden-on-phone={state.hiddenOnPhone ? "true" : "false"}
                className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1"
              >
                <span className="w-5 shrink-0 text-center tnum text-muted-foreground">{index + 1}</span>
                <span className={cn("min-w-0 flex-1 truncate", state.hiddenOnPhone && "text-muted-foreground line-through")}>
                  {label(section)}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || index === 0 || Boolean(upBlocked)}
                  title={upBlocked ?? undefined}
                  aria-label={`Move ${label(section)} earlier on phones`}
                  onClick={() => void commit(planPhoneMove(visible, section.id, "up"))}
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || index === ordered.length - 1 || Boolean(downBlocked)}
                  title={downBlocked ?? undefined}
                  aria-label={`Move ${label(section)} later on phones`}
                  onClick={() => void commit(planPhoneMove(visible, section.id, "down"))}
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={state.hiddenOnPhone ? "secondary" : "ghost"}
                  disabled={busy || lead}
                  aria-pressed={state.hiddenOnPhone}
                  aria-label={state.hiddenOnPhone ? `Show ${label(section)} on phones` : `Hide ${label(section)} on phones`}
                  title={lead ? LEAD_HIDE_REASON : state.hiddenOnPhone ? "Hidden on phones — tap to show" : "Hide on phones"}
                  onClick={() => void commit([planPhoneHidden(section, !state.hiddenOnPhone)])}
                >
                  {state.hiddenOnPhone ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
