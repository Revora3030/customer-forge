/**
 * Live canvas skeleton for the builder preview.
 *
 * Shown in the preview pane while a workspace has no pages yet (first build),
 * so the owner sees the shape of their website forming instead of an empty
 * column. Every status line comes from rows the server actually wrote
 * (builder_progress + generation_jobs) — no invented stages, counts or
 * percentages. Once the worker writes the first pages, the website content
 * query refreshes and the real draft replaces this skeleton without a reload.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useLatestGenerationJob } from "@/lib/site-engine.hooks";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
import { jobLiveness } from "@/lib/builder/job-liveness";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["queued", "processing"]);
/** How often the empty canvas re-checks for freshly written pages. */
export const SKELETON_CONTENT_POLL_MS = 4_000;

type JobRow = {
  status?: string | null;
  current_step?: string | null;
  progress?: number | null;
  lease_expires_at?: string | null;
  updated_at?: string | null;
};

/** The single status line shown over the canvas, from real recorded progress only. */
export function canvasStatusLine(input: {
  status: string | null;
  stalled: boolean;
  latestStage: string | null;
  latestDetail: string | null;
}): string {
  if (input.stalled) return "Reconnecting to your build…";
  if (input.status === "failed") return "The build hit a problem — it retries automatically.";
  if (input.status === "queued") return "Your build is queued — the AI team starts in a few seconds…";
  if (input.status === "processing") {
    if (input.latestStage) {
      const stage = input.latestStage.trim().replace(/[.…]+$/, "");
      const detail = input.latestDetail?.trim();
      return detail && !/^Build progress:/i.test(detail) ? `${stage} — ${detail}` : `${stage}…`;
    }
    return "Revora's AI team is starting your website…";
  }
  return "Describe your business in the chat — your website takes shape here.";
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-muted/70 animate-pulse", className)} aria-hidden />;
}

export function LiveCanvasSkeleton({
  organizationId,
  businessName = null,
}: {
  organizationId: string | null | undefined;
  businessName?: string | null;
}) {
  const job = useLatestGenerationJob(organizationId ?? undefined);
  const row = (job.data ?? null) as JobRow | null;
  const status = row?.status ?? null;
  const active = Boolean(status && ACTIVE.has(status));
  const stalled = jobLiveness(row, job.dataUpdatedAt || Date.now()) === "stalled";
  const { latest } = useBuildProgress(organizationId, active);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  // Pages can land before the job is marked complete; keep the content query
  // fresh while a build runs so the real draft replaces this skeleton on its own.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!organizationId || !active) return;
    const id = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
    }, SKELETON_CONTENT_POLL_MS);
    return () => window.clearInterval(id);
  }, [organizationId, active, queryClient]);

  const line = canvasStatusLine({
    status,
    stalled,
    latestStage: latest?.stage ?? null,
    latestDetail: latest?.detail ?? null,
  });
  const percent =
    active && typeof row?.progress === "number" ? Math.max(0, Math.min(100, Math.round(row.progress))) : null;
  const phone = device === "phone";

  return (
    <section
      className="panel flex min-h-0 flex-col overflow-hidden p-0"
      aria-label="Live website preview"
      data-testid="builder-preview-skeleton"
    >
      <header className="flex items-center gap-2 border-b border-border bg-card/80 p-2.5 backdrop-blur">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {businessName ? `${businessName} — first draft` : "Your first draft"}
        </p>
        <Button
          type="button"
          size="icon-sm"
          variant={!phone ? "secondary" : "ghost"}
          aria-pressed={!phone}
          aria-label="Desktop skeleton preview"
          onClick={() => setDevice("desktop")}
        >
          <Monitor className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={phone ? "secondary" : "ghost"}
          aria-pressed={phone}
          aria-label="Phone skeleton preview"
          onClick={() => setDevice("phone")}
        >
          <Smartphone className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="relative min-h-[560px] flex-1 overflow-hidden bg-elevated p-3 sm:min-h-[680px]">
        {/* Ambient AI status — real recorded stage only. */}
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-x-3 top-3 z-10 mx-auto flex max-w-xl items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-2 text-[12.5px] shadow-lift backdrop-blur"
        >
          <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden>
            {active && !stalled ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
            ) : null}
            <span className={cn("relative size-2 rounded-full", stalled ? "bg-amber-500" : "bg-primary")} />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {active && !stalled ? <Shimmer as="span">{line}</Shimmer> : line}
          </span>
          {percent !== null ? <span className="tnum shrink-0 text-muted-foreground">{percent}%</span> : null}
        </div>

        {/* Browser window */}
        <div
          className={cn(
            "mx-auto mt-12 overflow-hidden rounded-lg border border-border bg-background shadow-lift transition-[max-width] duration-300",
            phone ? "max-w-[390px]" : "max-w-[1100px]",
          )}
          aria-hidden
        >
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <Bar className="ml-3 h-4 flex-1 max-w-xs" />
          </div>

          <div className={cn("space-y-10 p-5", phone ? "sm:p-5" : "sm:p-10")}>
            {/* Nav */}
            <div className="flex items-center justify-between">
              <Bar className="h-5 w-28" />
              <div className={cn("gap-3", phone ? "hidden" : "hidden sm:flex")}>
                <Bar className="h-3 w-14" />
                <Bar className="h-3 w-14" />
                <Bar className="h-3 w-14" />
              </div>
            </div>

            {/* Hero masthead */}
            <div className={cn("grid items-center gap-8", !phone && "sm:grid-cols-2")}>
              <div className="space-y-4">
                <Bar className="h-5 w-32 rounded-full" />
                <Bar className="h-9 w-full" />
                <Bar className="h-9 w-4/5" />
                <Bar className="h-4 w-3/4" />
                <div className="flex gap-3 pt-2">
                  <Bar className="h-10 w-32 rounded-full bg-primary/25" />
                  <Bar className="h-10 w-28 rounded-full" />
                </div>
              </div>
              <Bar className="aspect-[4/3] w-full rounded-xl" />
            </div>

            {/* Bento service grid */}
            <div className={cn("grid gap-4", !phone && "sm:grid-cols-3")}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3 rounded-xl border border-border/60 p-4">
                  <Bar className="aspect-[16/10] w-full rounded-lg" />
                  <Bar className="h-4 w-2/3" />
                  <Bar className="h-3 w-full" />
                  <Bar className="h-3 w-5/6" />
                </div>
              ))}
            </div>

            {/* Value proposition & trust */}
            <div className={cn("grid gap-6", !phone && "sm:grid-cols-[1.2fr_1fr]")}>
              <div className="space-y-3">
                <Bar className="h-7 w-3/4" />
                <Bar className="h-3 w-full" />
                <Bar className="h-3 w-11/12" />
                <Bar className="h-3 w-4/5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Bar key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            </div>

            {/* Lead capture */}
            <div className="space-y-3 rounded-xl border border-border/60 p-5">
              <Bar className="h-6 w-48" />
              <div className={cn("grid gap-3", !phone && "sm:grid-cols-2")}>
                <Bar className="h-10" />
                <Bar className="h-10" />
              </div>
              <Bar className="h-20" />
              <Bar className="h-10 w-36 rounded-full bg-primary/25" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
