import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkline } from "@/components/admin/city/Sparkline";
import { getOpsStatsTrends } from "@/lib/ops-stats-trends.functions";
import { trendTotalLabel, type OpsStatsTrends, type TrendSeries } from "@/lib/ops-stats-trends";

type WindowDays = 7 | 30;

/**
 * JC-52: 7/30-day sparklines for builds ok/failed, leads, trials and approvals
 * waited. Reuses the city Sparkline. Unreadable series say "not measured",
 * never a fake flat zero. N is the sum of the window.
 */
export function StatsTrends() {
  const load = useServerFn(getOpsStatsTrends);
  const query = useQuery({ queryKey: ["jarvis", "ops-stats-trends"], queryFn: () => load(), staleTime: 60_000 });
  return (
    <StatsTrendsView
      data={query.data}
      loading={query.isPending}
      failed={query.isError}
      onRetry={() => {
        void query.refetch();
      }}
      retrying={query.isFetching}
    />
  );
}

export function StatsTrendsView({
  data,
  loading,
  failed,
  onRetry,
  retrying,
}: {
  data: OpsStatsTrends | undefined;
  loading: boolean;
  failed: boolean;
  onRetry?: (() => void) | undefined;
  retrying?: boolean | undefined;
}) {
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  return (
    <section aria-label="Stats trends" className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Stats trends</h3>
          <p className="text-xs text-muted-foreground">Recorded counts per day. Unreadable sources say not measured.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Trend window" className="inline-flex rounded-md border border-border p-0.5">
            {([7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={windowDays === days}
                className={`min-h-9 rounded px-2.5 text-xs font-medium ${windowDays === days ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setWindowDays(days)}
              >
                {days} days
              </button>
            ))}
          </div>
          <a
            href="/admin/city?district=executive"
            className="inline-flex min-h-9 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
          >
            Open Executive district
          </a>
        </div>
      </div>
      {loading && !data ? <p className="text-xs text-muted-foreground">Loading trends…</p> : null}
      {failed && !data ? (
        <p role="alert" className="text-xs text-destructive">
          Trends unavailable.
          {onRetry ? (
            <>
              {" "}
              <button type="button" className="underline" onClick={onRetry} disabled={retrying}>
                {retrying ? "Retrying…" : "Retry"}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {data ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.series.map((series) => (
            <TrendCard key={series.key} series={series} windowDays={windowDays} rowLimit={data.rowLimit} />
          ))}
        </ul>
      ) : null}
      {data ? (
        <p className="text-xs text-muted-foreground">
          Builds use generation job updates; leads exclude the test_lead source; trials are customer workspaces only
          (same rule as the platform funnel); approvals are rows created on the approval queue. Checked{" "}
          {new Date(data.checkedAt).toLocaleString()}.
        </p>
      ) : null}
    </section>
  );
}

function TrendCard({ series, windowDays, rowLimit }: { series: TrendSeries; windowDays: WindowDays; rowLimit: number }) {
  const values = windowDays === 7 ? series.days7 : series.days30;
  const n = windowDays === 7 ? series.n7 : series.n30;
  return (
    <li className="min-w-0 rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{series.label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{trendTotalLabel(n, series.capped)}</p>
      </div>
      <div className="mt-2">
        {values ? (
          <Sparkline values={values} label={`${series.label}, last ${windowDays} days`} unit="days" />
        ) : (
          <p className="text-xs text-muted-foreground">not measured — this source could not be read.</p>
        )}
      </div>
      {series.capped ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Only the newest {rowLimit.toLocaleString("en-US")} rows were read, so N is a floor.
        </p>
      ) : null}
    </li>
  );
}
