/**
 * Shows what Revora has actually been doing for this business: website builds,
 * automated follow-ups and account events, newest first. Every line comes from
 * a real database row — when there is nothing, it says so.
 */

import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2, Radio } from "lucide-react";
import { useActivityFeed } from "@/lib/observability.hooks";

const when = (iso: string) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function ActivityFeed({ organizationId }: { organizationId: string | undefined }) {
  const { data, isLoading, isError } = useActivityFeed(organizationId);

  return (
    <section className="panel p-4" aria-labelledby="activity-title">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 id="activity-title" className="text-sm font-semibold">
            <Radio className="mr-1.5 inline size-4 text-primary" aria-hidden /> System activity
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {isLoading
              ? "Reading your workspace…"
              : isError && !data
                ? "Activity unavailable right now. Revora couldn't read it — this doesn't mean anything is wrong with your website. It will retry shortly."
                : isError
                  ? "Activity unavailable right now — showing the last activity Revora read, which may be out of date."
                  : (data?.health.summary ?? "")}
          </p>
        </div>
      </header>

      {data?.unavailable.length ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Not shown right now: {data.unavailable.join(", ")}.
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading activity…
        </p>
      ) : data && data.events.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {data.events.map((event) => {
            const Icon =
              event.level === "problem"
                ? AlertTriangle
                : event.level === "working"
                  ? Loader2
                  : CheckCircle2;
            return (
              <li
                key={event.id}
                className="flex items-start gap-2 rounded-md border border-border/60 bg-card/40 p-2.5"
              >
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${
                    event.level === "problem"
                      ? "text-destructive"
                      : event.level === "working"
                        ? "animate-spin text-primary"
                        : "text-primary"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium break-words">{event.title}</p>
                  {event.detail ? (
                    <p className="text-[12px] break-words text-muted-foreground">{event.detail}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">{when(event.at)}</p>
                </div>
                {event.to ? (
                  <Link to={event.to} className="text-[12px] text-primary underline shrink-0">
                    Open
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : !isError ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No activity recorded yet. Once Revora builds your site or sends a follow-up, it appears
          here.
        </p>
      ) : null}
    </section>
  );
}
