/**
 * Before/after slider for one checkpoint (CU-5): the checkpoint's pages and
 * sections on the left of the handle, the live site now on the right. It draws
 * a text outline of each saved copy (headings and first words), not a
 * screenshot, and says so. Changed sections are marked on both sides.
 *
 * Phone first: one column, the slider is a native range input (works with a
 * thumb, a mouse and the keyboard) and the outline scrolls inside the panel.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { compareCheckpoint } from "@/lib/builder/checkpoints.functions";
import { changedSectionIds, type SnapshotOutline } from "@/lib/builder/checkpoints";
import { clampSplit } from "@/lib/builder/compare-slider";
import { cn } from "@/lib/utils";

function Outline({
  outline,
  changed,
  tone,
}: {
  outline: SnapshotOutline;
  changed: Set<string>;
  tone: "before" | "after";
}) {
  if (!outline.pages.length)
    return <p className="p-3 text-[13px] text-muted-foreground">No pages in this copy.</p>;
  return (
    <div className="space-y-3 p-3">
      {outline.pages.map((page) => (
        <div key={page.id} className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {page.title}
          </p>
          {page.sections.map((section) => (
            <div
              key={section.id}
              data-changed={changed.has(section.id) ? "true" : undefined}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[12.5px] leading-5 [overflow-wrap:anywhere]",
                changed.has(section.id)
                  ? tone === "before"
                    ? "border-amber-400/70 bg-amber-400/10"
                    : "border-emerald-400/70 bg-emerald-400/10"
                  : "border-border/60",
              )}
            >
              <span className="block text-[11px] text-muted-foreground">{section.label}</span>
              {section.heading ? (
                <span className="block font-medium">{section.heading}</span>
              ) : null}
              {section.text ? (
                <span className="block text-muted-foreground">{section.text}</span>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CheckpointCompareView({
  before,
  after,
  beforeLabel,
  initialSplit = 50,
}: {
  before: SnapshotOutline;
  after: SnapshotOutline;
  beforeLabel: string;
  initialSplit?: number;
}) {
  const [split, setSplit] = useState(clampSplit(initialSplit));
  const changed = useMemo(() => changedSectionIds(before, after), [before, after]);
  return (
    <div className="space-y-2" data-testid="checkpoint-compare">
      <p className="text-[12px] text-muted-foreground">
        {changed.size
          ? `${changed.size} section${changed.size === 1 ? "" : "s"} differ. Text outline of each saved copy, not a screenshot.`
          : "No text differences. Text outline of each saved copy, not a screenshot."}
      </p>
      <div className="relative max-h-[55vh] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background">
        <div className="grid">
          <div className="col-start-1 row-start-1" aria-label="Live site now">
            <Outline outline={after} changed={changed} tone="after" />
          </div>
          <div
            className="col-start-1 row-start-1 bg-background"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            aria-label={`${beforeLabel} (before)`}
          >
            <Outline outline={before} changed={changed} tone="before" />
          </div>
          <div
            aria-hidden
            className="pointer-events-none col-start-1 row-start-1 w-[2px] -translate-x-1/2 bg-primary"
            style={{ marginLeft: `${split}%` }}
          />
        </div>
        <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
          Before
        </span>
        <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
          Now
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(split)}
        onChange={(event) => setSplit(clampSplit(Number(event.target.value)))}
        aria-label={`Before and after split: ${beforeLabel} versus the live site now`}
        aria-valuetext={`${Math.round(split)}% before, ${100 - Math.round(split)}% now`}
        className="h-11 w-full cursor-ew-resize accent-[var(--primary)]"
      />
    </div>
  );
}

/** Loads the two outlines from the server (owners and admins only) and shows the slider. */
export function CheckpointCompare({
  organizationId,
  versionId,
  beforeLabel,
}: {
  organizationId: string;
  versionId: string;
  beforeLabel: string;
}) {
  const load = useServerFn(compareCheckpoint);
  const query = useQuery({
    queryKey: ["builder_checkpoint_compare", organizationId, versionId],
    retry: false,
    staleTime: 60_000,
    queryFn: () => load({ data: { organizationId, versionId } }),
  });
  if (query.isLoading)
    return <p className="text-[13px] text-muted-foreground">Loading the comparison…</p>;
  if (query.isError || !query.data)
    return <p className="text-[13px] text-destructive">Couldn't load the comparison right now.</p>;
  return (
    <CheckpointCompareView
      before={query.data.before}
      after={query.data.after}
      beforeLabel={beforeLabel}
    />
  );
}
