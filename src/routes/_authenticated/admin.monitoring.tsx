import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BellRing } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { getErrorFeed } from "@/lib/monitoring.functions";
import { getBuildHealth } from "@/lib/build-monitoring.functions";

export const Route = createFileRoute("/_authenticated/admin/monitoring")({
  head: () => ({
    meta: [
      { title: "Monitoring — Revora admin" },
      {
        name: "description",
        content: "Production crashes, API failures and job errors across the platform.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminMonitoring,
});

const when = (value: string) =>
  new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

const tone = (level: string) =>
  level === "fatal" || level === "error" ? "danger" : level === "warning" ? "attention" : "signal";

function AdminMonitoring() {
  const load = useServerFn(getErrorFeed);
  const feed = useQuery({
    queryKey: ["admin-error-feed"],
    queryFn: () => load({}),
    refetchInterval: 60_000,
  });

  const data = feed.data;
  const loadHealth = useServerFn(getBuildHealth);
  const health = useQuery({
    queryKey: ["admin-build-health"],
    queryFn: () => loadHealth({}),
    refetchInterval: 60_000,
  });
  const h = health.data;
  const secs = (value: number | null | undefined) =>
    value == null ? "—" : value < 90 ? `${Math.round(value)}s` : `${Math.round(value / 60)}m`;

  return (
    <div className="product-page">
      <SectionHeading
        title="Monitoring & alerts"
        description="Every server crash, failed API call, webhook error and background job failure recorded in the last 7 days."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Errors (24h)" value={String(data?.totals.last24h ?? 0)} />
        <MetricCard label="Errors (7d)" value={String(data?.totals.last7d ?? 0)} />
        <MetricCard
          label="Forwarded to Sentry"
          value={data?.sentryConfigured ? String(data.totals.forwarded) : "off"}
          hint={
            data?.sentryConfigured
              ? "Alerts are delivered through your Sentry project."
              : "Add a SENTRY_DSN to route alerts to Sentry. In-app tracking is already live."
          }
        />
      </div>

      <Panel>
        <SectionHeading
          title="Builds, publishes & pictures (7 days)"
          description="Success rate, build times, where builds fail, live publish checks and picture approvals."
        />
        {health.isLoading ? <LoadingRows /> : null}
        {health.error ? <ErrorNote message={(health.error as Error).message} /> : null}
        {h ? (
          <>
            {h.alerts.length ? (
              <ul className="mb-3 space-y-1" role="alert">
                {h.alerts.map((alert) => (
                  <li key={alert} className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {alert}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricCard label="Build success" value={h.builds.successRate == null ? "—" : `${h.builds.successRate}%`} />
              <MetricCard label="Median build" value={secs(h.builds.medianBuildSeconds)} hint={`p90 ${secs(h.builds.p90BuildSeconds)}`} />
              <MetricCard label="Builds" value={String(h.builds.total)} hint={`${h.builds.failed} failed · ${h.builds.cancelled} cancelled · ${h.builds.active} running`} />
              <MetricCard label="Live checks passed" value={h.publishes.passRate == null ? "—" : `${h.publishes.passRate}%`} hint={`${h.publishes.total} publishes`} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="product-tile">
                <p className="font-medium">Failures by kind</p>
                {h.builds.failuresByKind.length ? (
                  <ul className="mt-1 text-muted-foreground">
                    {h.builds.failuresByKind.map((f) => (
                      <li key={f.kind}>{f.kind}: {f.count}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">None</p>
                )}
              </div>
              <div className="product-tile">
                <p className="font-medium">Slowest stages (median)</p>
                {h.builds.slowestStages.length ? (
                  <ul className="mt-1 text-muted-foreground">
                    {h.builds.slowestStages.map((s) => (
                      <li key={s.stage}>{s.stage}: {s.medianSeconds}s ({s.samples})</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">No timings yet</p>
                )}
              </div>
              <div className="product-tile">
                <p className="font-medium">Pictures</p>
                <p className="mt-1 text-muted-foreground">
                  {h.images.approved} approved · {h.images.pending} pending · {h.images.rejected} rejected · {h.images.failed} failed
                </p>
              </div>
            </div>
          </>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeading
          title="Grouped issues"
          description="Ranked by how often the same failure happened."
        />
        {feed.isLoading ? <LoadingRows /> : null}
        {feed.error ? <ErrorNote message={(feed.error as Error).message} /> : null}
        {!feed.isLoading && !data?.groups.length ? (
          <EmptyState
            icon={<Activity className="size-5" />}
            title="No errors recorded"
            description="Nothing has failed in the last 7 days. New failures appear here within a minute."
          />
        ) : null}
        <div className="space-y-2">
          {(data?.groups ?? []).map((group) => (
            <div
              key={group.fingerprint}
              className="product-tile"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={tone(group.level)}>{group.level}</Pill>
                <Pill tone="info">{group.source}</Pill>
                <span className="font-medium">{group.count}×</span>
                <span className="text-muted-foreground">last {when(group.lastSeen)}</span>
              </div>
              <p className="mt-1 break-words">{group.message}</p>
              {group.route ? <p className="text-muted-foreground">at {group.route}</p> : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Most recent"
          description="Newest events first, exactly as recorded."
        />
        <div className="space-y-1.5">
          {(data?.recent ?? []).map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 product-tile"
            >
              <Pill tone={tone(row.level)}>{row.level}</Pill>
              <span className="text-muted-foreground">{when(row.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate">{row.message}</span>
              {row.statusCode ? <Pill tone="info">{row.statusCode}</Pill> : null}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
