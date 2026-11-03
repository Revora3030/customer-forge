/**
 * What an applied request changed, said once.
 *
 * Drawn from the stored counts (applied / failed / stale) and stored owner-
 * language reasons, never from frozen notice text, so older chats get the same
 * wording. An apply only writes the draft: nothing here claims the change
 * reached the live website.
 */
import type { ReactNode } from "react";
import { Check, ChevronRight, Eye, RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyHeadline, skippedLine, skippedReasons } from "@/lib/builder/apply-report";

export type ApplyResultCardProps = {
  applied: number;
  failedCount?: number | undefined;
  staleCount?: number | undefined;
  /** Owner-language reasons stored with the result (falls back to the raw labels). */
  reasons?: string[] | undefined;
  /** Titles of the planned changes. */
  titles?: string[] | undefined;
  /** For each title, a way to show that change in the preview (null where it has no place there). */
  reveals?: (((() => void) | null) | undefined)[] | undefined;
  /** Raw apply labels, only under "Technical details". */
  details?: string[] | undefined;
  onRetrySkipped?: (() => void) | undefined;
  onUndo?: (() => void) | undefined;
  onPreview?: (() => void) | undefined;
  /** The "Inspect changes" drawer (owner roles only; the caller decides). */
  inspect?: ReactNode;
};

export function ApplyResultCard({
  applied,
  failedCount = 0,
  staleCount = 0,
  reasons,
  titles = [],
  reveals = [],
  details = [],
  onRetrySkipped,
  onUndo,
  onPreview,
  inspect,
}: ApplyResultCardProps) {
  // Never a success line when nothing was written.
  if (applied <= 0) return null;
  const skipped = (failedCount ?? 0) + (staleCount ?? 0);
  const why = reasons?.length ? reasons : skippedReasons(details);
  return (
    <div className="rounded-xl border border-border/70 bg-card/50 p-3" data-testid="apply-result">
      <p className="flex items-center gap-2 text-[15px] font-medium text-foreground">
        <Check className="size-4 shrink-0 text-emerald-400" aria-hidden />
        {applyHeadline(applied)}
      </p>
      {skipped > 0 ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{skippedLine(skipped, why)}</p> : null}

      {titles.length ? (
        <details className="group mt-2">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            {skipped > 0 ? "What I worked on" : "What changed"} ({titles.length})
          </summary>
          <ul className="mt-1 space-y-1 pl-5 text-sm text-foreground/90">
            {titles.map((title, index) => (
              <li key={`${title}-${index}`} className="list-disc break-words">
                {title}
                {reveals[index] ? (
                  <button
                    type="button"
                    onClick={reveals[index]!}
                    aria-label={`Show in preview: ${title}`}
                    className="relative ml-2 inline-flex cursor-pointer items-center gap-1 align-middle text-xs text-muted-foreground underline-offset-2 after:absolute after:-inset-2 hover:text-foreground hover:underline"
                  >
                    <Eye className="size-3" aria-hidden /> Show
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {inspect}

      <div className="mt-3 flex flex-wrap gap-2">
        {skipped > 0 && onRetrySkipped ? (
          <Button size="sm" variant="outline" data-tap="primary" onClick={onRetrySkipped}>
            <RotateCw className="size-4" aria-hidden />
            {skipped === 1 ? "Try that one again" : `Try those ${skipped} again`}
          </Button>
        ) : null}
        {onUndo ? (
          <Button size="sm" variant="outline" data-tap="primary" onClick={onUndo}>
            <Undo2 className="size-4" aria-hidden /> Undo
          </Button>
        ) : null}
        {onPreview ? (
          <Button size="sm" variant="outline" data-tap="primary" className="lg:hidden" onClick={onPreview}>
            <Eye className="size-4" aria-hidden /> Preview
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Not live yet — Publish when you&apos;re happy.</p>

      {details.length ? (
        <details className="mt-1">
          <summary className="min-h-9 cursor-pointer py-2 text-xs text-muted-foreground">Technical details</summary>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {details.map((line, index) => (
              <li key={`${line}-${index}`} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
