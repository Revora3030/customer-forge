/**
 * Watch-your-site-being-built panel.
 *
 * Shown right after signup/payment and on the client portal while the first
 * generation job is running. Everything it shows comes from rows the server
 * actually wrote (builder_progress + generation_jobs) — never invented
 * stages, never a fake percentage. When no build is running it renders
 * nothing, so callers can mount it unconditionally.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useLatestGenerationJob } from "@/lib/site-engine.hooks";
import { RECOVERING_BUILD_MESSAGE, jobLiveness } from "@/lib/builder/job-liveness";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
import { describeBuildFailure } from "@/lib/builder/build-failure";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["queued", "processing"]);

type JobRow = {
  status?: string;
  current_step?: string | null;
  progress?: number | null;
  error_message?: string | null;
  failure_kind?: string | null;
  lease_expires_at?: string | null;
  updated_at?: string | null;
};

export function BuildLive({ organizationId }: { organizationId: string | null | undefined }) {
  const job = useLatestGenerationJob(organizationId ?? undefined);
  const row = (job.data ?? null) as JobRow | null;
  const status = row?.status ?? null;
  const active = Boolean(status && ACTIVE.has(status));
  const failed = status === "failed";
  const failure = describeBuildFailure(row ?? {});
  // A worker that died leaves the job "processing" with a lapsed lease. Say so
  // plainly (the server sweep re-queues or closes it) instead of an endless
  // "finishing" shimmer.
  const stalled = jobLiveness(row, job.dataUpdatedAt || Date.now()) === "stalled";

  // Poll the recorded build stages while the job needs watching.
  const { latest, steps } = useBuildProgress(organizationId, active || failed);

  const [open, setOpen] = useState(true);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active && !failed) return null;

  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const percent =
    typeof row?.progress === "number" ? Math.max(0, Math.min(100, Math.round(row.progress))) : null;

  // Newest-first in, oldest-first out, duplicates collapsed — the owner reads
  // the build as a story top to bottom.
  const done = steps
    .slice()
    .reverse()
    .filter((step, index, all) => index === all.findIndex((s) => s.stage === step.stage))
    .slice(-14);

  return (
    <Panel className="overflow-hidden p-0" aria-live="polite">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <span className="relative grid size-6 shrink-0 place-items-center">
          {active ? (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" aria-hidden />
              <span className="relative size-2.5 rounded-full bg-primary" aria-hidden />
            </>
          ) : (
            <TriangleAlert className="size-4 text-destructive" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">
            {stalled ? (
              <span className="text-amber-500">Reconnecting to your build…</span>
            ) : active ? (
              <Shimmer as="span">{latest ? `${latest.stage}…` : "Starting your website build…"}</Shimmer>
            ) : (
              failure?.label ?? "The build hit a problem — our team has been notified"
            )}
          </span>
          <span className="block text-[12px] text-muted-foreground">
            {stalled
              ? "The build worker stopped responding. Revora is restarting it automatically."
              : active
              ? "Revora is building your website right now — you can watch every step here."
              : "You can keep going; the build retries automatically and nothing is charged twice."}
          </span>
        </span>
        {active ? (
          <span className="tnum shrink-0 text-[12px] text-muted-foreground">
            {percent !== null ? `${percent}% · ` : ""}
            {elapsedLabel}
          </span>
        ) : null}
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border/60 px-5 py-4">
          {percent !== null && active ? (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
          {done.length ? (
            <ol className="space-y-1.5">
              {done.map((step) => (
                <li
                  key={`${step.stage}-${step.at}`}
                  className="chat-rise flex items-start gap-2 text-[13px] text-muted-foreground"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <span className="min-w-0 break-words">
                    {step.stage}
                    {step.detail ? <span className="text-muted-foreground/70"> — {step.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : active ? (
            <p className="text-[13px] text-muted-foreground">
              Queued — the builder picks up new jobs within a few seconds.
            </p>
          ) : null}
          {stalled ? (
            <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600">
              {row?.error_message || RECOVERING_BUILD_MESSAGE} If it doesn’t resume in a couple of minutes it will be
              stopped, and you can press Build to try again.
            </p>
          ) : null}
          {failed && failure ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              {failure.message}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button asChild variant="signal" size="sm">
              <Link to="/app/website">Open the live builder</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/** Compact heading variant for pages that already have their own panel chrome. */
export function BuildLiveSection({ organizationId }: { organizationId: string | null | undefined }) {
  return (
    <section aria-label="Website build progress">
      <SectionHeading eyebrow="Live build" title="Watch your site being built" />
      <div className="mt-3">
        <BuildLive organizationId={organizationId} />
      </div>
    </section>
  );
}
