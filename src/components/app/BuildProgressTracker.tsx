/**
 * Build-progress tracker for the Welcome page.
 *
 * A labelled stage list (done / current / pending) read straight from the
 * latest generation job the worker wrote. No percentages, no time estimates.
 * A failed or cancelled build is shown as such, with the existing owner-facing
 * failure message. It polls through useLatestGenerationJob, the same query the
 * "Watch your site being built" panel uses, so there is no second poller.
 * Renders nothing until a build job exists.
 */
import { Check, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { useLatestGenerationJob } from "@/lib/site-engine.hooks";
import { buildTrackerModel, type TrackerJobRow, type TrackerStepState } from "@/lib/builder/build-progress-steps";
import type { Tone } from "@/lib/domain";
import { cn } from "@/lib/utils";

const PHASE_TONE: Record<string, Tone> = {
  queued: "neutral",
  building: "info",
  completed: "signal",
  failed: "danger",
  cancelled: "attention",
};

const STATE_WORD: Record<TrackerStepState, string> = {
  done: "Done",
  current: "In progress",
  pending: "Not started",
  failed: "Stopped here",
};

function StepIcon({ state }: { state: TrackerStepState }) {
  if (state === "done") return <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />;
  if (state === "current") return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />;
  if (state === "failed") return <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
  return <CircleDashed className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />;
}

export function BuildProgressTracker({ organizationId }: { organizationId: string | null | undefined }) {
  const job = useLatestGenerationJob(organizationId ?? undefined);
  const model = buildTrackerModel((job.data ?? null) as TrackerJobRow | null);
  if (!model) return null;

  return (
    <section aria-label="Build progress tracker">
      <Panel className="p-5" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionHeading eyebrow="Build progress" title="Where your website build stands" />
          <Pill tone={PHASE_TONE[model.phase] ?? "neutral"} dot>
            {model.statusLabel}
          </Pill>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {model.summary} <span className="tnum">{model.doneCount} of {model.steps.length} stages finished.</span>
        </p>

        {model.failure ? (
          <div role="status" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px]">
            <p className="font-medium text-destructive">{model.failure.label}</p>
            <p className="mt-0.5 text-destructive">{model.failure.message}</p>
          </div>
        ) : null}
        {model.completedNote ? (
          <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600">
            {model.completedNote}
          </p>
        ) : null}

        <ol className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {model.steps.map((step) => (
            <li
              key={step.key}
              data-state={step.state}
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-[13px]",
                step.state === "pending" ? "text-muted-foreground/70" : step.state === "done" ? "text-muted-foreground" : "font-medium",
                step.state === "failed" && "text-destructive",
              )}
            >
              <StepIcon state={step.state} />
              <span className="min-w-0 flex-1">{step.label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{STATE_WORD[step.state]}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </section>
  );
}
