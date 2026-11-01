/**
 * The build's work log, in the chat. Like a coding agent's transcript: the
 * current step is live, every finished step shows how long it took, the AI
 * calls show which models answered, and pictures appear as they are made.
 * Everything comes from rows the server wrote (see work-feed.ts); a step with
 * no recorded detail shows none. Ended builds collapse to one line
 * ("Worked for 7m 10s · 14 steps · 9 AI calls") that opens to the full log.
 */
import { useState } from "react";
import { Check, ChevronDown, Circle, Loader2, TriangleAlert } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { CapacityWaitNotice } from "@/components/app/CapacityWaitNotice";
import { jobLiveness } from "@/lib/builder/job-liveness";
import { describeBuildFailure } from "@/lib/builder/build-failure";
import { formatDuration, quietNotice, stalledNotice, type WorkFeed as Feed } from "@/lib/builder/work-feed";
import { useWorkFeed, type WorkFeedJobRow } from "@/lib/builder/work-feed.hooks";
import { cn } from "@/lib/utils";

/** The log for one build. `runId` is the chat request (or job) id; none follows the latest build. */
export function WorkFeed({
  organizationId,
  runId = null,
  live = true,
  onStop,
  stopping = false,
}: {
  organizationId: string | null | undefined;
  runId?: string | null;
  live?: boolean;
  /** Stops the build (managers and above). Offered only while it is running. */
  onStop?: (jobId: string) => void;
  stopping?: boolean;
}) {
  const { feed, job, loading } = useWorkFeed(organizationId, { runId, live });
  if (loading || feed.state === "none") return null;
  return <WorkFeedView feed={feed} job={job} {...(onStop ? { onStop } : {})} stopping={stopping} />;
}

/**
 * Stops a running build. Always in view while a build runs (not tucked inside
 * the collapsed log): a build spends credits for as long as it runs, so
 * stopping it must be one tap away. A second tap confirms, so a stray tap on a
 * phone cannot throw away minutes of work.
 */
export function StopBuildBar({
  confirming,
  stopping,
  onAsk,
  onKeep,
  onConfirm,
}: {
  confirming: boolean;
  stopping: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/50 px-3.5 py-2" data-testid="stop-build">
      {confirming || stopping ? (
        <>
          <p className="mr-auto min-w-0 flex-1 text-xs leading-5 text-muted-foreground" role="status">
            {stopping ? "Stopping — no new AI work is being started." : "Stop this build? Nothing is published and spending stops."}
          </p>
          {stopping ? null : (
            <Button type="button" size="sm" variant="ghost" onClick={onKeep}>
              Keep building
            </Button>
          )}
          <Button type="button" size="sm" variant="destructive" disabled={stopping} onClick={onConfirm}>
            {stopping ? "Stopping…" : "Stop build"}
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={onAsk}>
          Stop build
        </Button>
      )}
    </div>
  );
}

export function WorkFeedView({
  feed,
  job = null,
  onStop,
  stopping = false,
}: {
  feed: Feed;
  job?: WorkFeedJobRow | null;
  onStop?: (jobId: string) => void;
  stopping?: boolean;
}) {
  const ended = feed.state === "done" || feed.state === "failed" || feed.state === "cancelled";
  const [open, setOpen] = useState(!ended);
  const [showPending, setShowPending] = useState(false);
  const stalled = jobLiveness(job, Date.now()) === "stalled";
  const failure = feed.state === "failed" ? describeBuildFailure((job ?? {}) as never) : null;
  const pending = feed.stages.filter((s) => s.state === "pending");
  const shown = feed.stages.filter((s) => s.state !== "pending" || showPending);
  const running = feed.state === "running" || feed.state === "queued";
  const [confirmStop, setConfirmStop] = useState(false);
  const jobId = job?.id ?? null;
  const canStop = running && Boolean(onStop) && Boolean(jobId);

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40" data-testid="work-feed">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <span className="relative grid size-5 shrink-0 place-items-center" aria-hidden>
          {running ? (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-primary" />
            </>
          ) : feed.state === "done" ? (
            <Check className="size-4 text-emerald-400" />
          ) : (
            <TriangleAlert className="size-4 text-destructive" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-5 break-words" role="status" aria-live="polite" aria-atomic="true">
            {stalled ? <span className="text-amber-500">Reconnecting to your build…</span> : running ? <Shimmer as="span">{feed.headline}</Shimmer> : feed.headline}
          </span>
          {ended && feed.summary ? <span className="block truncate text-xs text-muted-foreground">{feed.summary}</span> : null}
        </span>
        {running && feed.elapsedMs != null ? (
          <span className="tnum shrink-0 text-xs text-muted-foreground" aria-hidden>
            {feed.percent != null ? `${feed.percent}%${feed.quietMs != null ? " (last reported)" : ""} · ` : ""}
            {formatDuration(feed.elapsedMs)}
          </span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {running && feed.percent != null ? (
        <div className="h-0.5 bg-primary/15" role="progressbar" aria-valuenow={feed.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Build progress">
          <div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${feed.percent}%` }} />
        </div>
      ) : null}
      <CapacityWaitNotice job={job as never} compact announce={false} className="mx-3.5 my-2" />
      {canStop ? (
        <StopBuildBar
          confirming={confirmStop}
          stopping={stopping}
          onAsk={() => setConfirmStop(true)}
          onKeep={() => setConfirmStop(false)}
          onConfirm={() => onStop?.(jobId as string)}
        />
      ) : null}

      {open ? (
        <div className="space-y-3 border-t border-border/60 px-3.5 py-3">
          <ol className="space-y-1.5" aria-label="Build steps">
            {shown.map((stage) => (
              <li key={stage.key} className="flex items-start gap-2 text-[13px] leading-5">
                <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center" aria-hidden>
                  {stage.state === "done" ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : stage.state === "running" ? (
                    <Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
                  ) : stage.state === "failed" ? (
                    <TriangleAlert className="size-3.5 text-destructive" />
                  ) : (
                    <Circle className="size-3 text-muted-foreground/50" />
                  )}
                </span>
                <span className={cn("min-w-0 flex-1 break-words", stage.state === "pending" || stage.state === "cancelled" ? "text-muted-foreground/70" : stage.state === "done" ? "text-muted-foreground" : "text-foreground")}>
                  {stage.label}
                  {stage.state === "running" && stage.key === "layout" && feed.sectionsDone != null ? (
                    <span className="block text-xs text-muted-foreground">{feed.sectionsDone} section{feed.sectionsDone === 1 ? "" : "s"} laid out so far</span>
                  ) : null}
                </span>
                {stage.state === "done" && stage.durationMs != null ? <span className="tnum shrink-0 text-xs text-muted-foreground/70">{formatDuration(stage.durationMs)}</span> : null}
              </li>
            ))}
          </ol>
          {pending.length ? (
            <button type="button" onClick={() => setShowPending((v) => !v)} className="min-h-9 cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
              {showPending ? "Hide the remaining steps" : `${pending.length} more step${pending.length === 1 ? "" : "s"} to come`}
            </button>
          ) : null}

          {feed.look || feed.sections.length ? (
            <div className="space-y-2 border-t border-border/50 pt-3" data-testid="taking-shape">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Taking shape</p>
              {feed.look ? (
                <div className="flex items-start gap-2 text-[13px] leading-5">
                  <span className="mt-1 flex shrink-0 -space-x-1" aria-hidden>
                    {feed.look.colors.map((color) => (
                      <span key={color} className="size-4 rounded-full border border-border/70" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {[feed.look.name, feed.look.font].filter(Boolean).join(" · ")}
                    {feed.look.mood ? <span className="block text-xs text-muted-foreground">{feed.look.mood}</span> : null}
                  </span>
                </div>
              ) : null}
              {feed.sections.length ? (
                <ol className="space-y-1.5" aria-label="Sections finished so far">
                  {feed.sections.map((section, index) => (
                    <li key={index} className="text-[13px] leading-5">
                      <span className="font-medium break-words">{section.headline}</span>
                      {section.blurb ? <span className="line-clamp-2 block text-xs text-muted-foreground">{section.blurb}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}

          {feed.ai.length ? (
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI team</p>
              <ul className="space-y-2">
                {feed.ai.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="text-[13px] leading-5">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 text-foreground">{item.label}</span>
                      {item.offsetMs != null ? <span className="tnum shrink-0 text-xs text-muted-foreground/70">+{formatDuration(item.offsetMs)}</span> : null}
                    </div>
                    {item.models.length ? (
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {item.models.slice(0, 4).map((m) => (
                          <span key={m.name} className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {m.name}
                            {m.count > 1 ? ` ×${m.count}` : ""}
                          </span>
                        ))}
                        {item.models.length > 4 ? <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{item.models.length - 4} more</span> : null}
                      </p>
                    ) : null}
                    {item.note ? <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {feed.pictures.length ? (
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pictures</p>
              <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {feed.pictures.slice(0, 8).map((picture) => (
                  <li key={picture.id} className="shrink-0">
                    <img src={picture.url ?? ""} alt={picture.slot ? `${picture.slot} picture` : "Generated picture"} loading="lazy" className="size-16 rounded-lg border border-border/60 object-cover" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {stalled ? (
            <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              {stalledNotice(job ?? {})}
            </p>
          ) : null}
          {!stalled && quietNotice(feed) ? (
            <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              {quietNotice(feed)}
            </p>
          ) : null}
          {failure ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{failure.message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
