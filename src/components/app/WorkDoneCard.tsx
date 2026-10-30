/**
 * "What Revora did for you": the last 30 days of work from delivery records,
 * next to the 30 days before. Items with nothing in either window are left
 * out; nothing here is estimated.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { getWorkDone } from "@/lib/growth/work-done.functions";
import type { WorkSummary } from "@/lib/growth/work-done";

export function WorkDoneView({ summary }: { summary: WorkSummary }) {
  if (!summary.lines.length) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing to show yet. Lead alerts, follow-ups, reports and site checks appear here as they happen.
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <ul className="grid gap-2 sm:grid-cols-2">
        {summary.lines.map((line) => (
          <li key={line.key} className="rounded-md border border-border p-3" title={line.hint}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">{line.current}</span>
              {line.change !== null && line.change !== 0 ? (
                <span className="text-xs text-muted-foreground">
                  {line.change > 0 ? "+" : ""}
                  {line.change} vs previous {summary.days} days
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm">{line.label}</p>
          </li>
        ))}
      </ul>
      {summary.unavailable.length ? (
        <p className="text-xs text-muted-foreground">
          Couldn't read right now: {summary.unavailable.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

export function WorkDoneCard({ organizationId }: { organizationId: string | undefined }) {
  const fetchWork = useServerFn(getWorkDone);
  const work = useQuery({
    queryKey: ["work-done", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
    queryFn: () => fetchWork({ data: { organizationId: organizationId! } }),
  });

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="work-done-title">
      <p className="eyebrow">Last 30 days</p>
      <h2 id="work-done-title" className="mt-1 text-base font-semibold">
        What Revora did for you
      </h2>
      {work.isError ? (
        <div className="mt-3">
          <QueryErrorNotice title="Couldn't load this summary." retry={() => work.refetch()} retrying={work.isFetching} />
        </div>
      ) : work.data ? (
        <WorkDoneView summary={work.data} />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      )}
    </section>
  );
}
