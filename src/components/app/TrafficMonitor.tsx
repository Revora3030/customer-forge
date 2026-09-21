/**
 * Website traffic monitor: how many people are visiting, where they come from,
 * what they do — and the problems worth fixing, each with a direct link to the
 * screen that fixes it.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { ArrowRight, BellRing, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getTrafficReport, setTrafficAlerts } from "@/lib/traffic.functions";
import { TRAFFIC_RANGES, severityTone, type TrafficIssue } from "@/lib/traffic";
import { dateLong } from "@/lib/format";

export function TrafficMonitor({
  organizationId,
  alertsEnabled = true,
  canManage,
}: {
  organizationId: string | undefined;
  alertsEnabled?: boolean;
  canManage: boolean;
}) {
  const [days, setDays] = useState("30");
  const [alerts, setAlerts] = useState(alertsEnabled);
  const report = useServerFn(getTrafficReport);
  const saveAlerts = useServerFn(setTrafficAlerts);

  const query = useQuery({
    queryKey: ["traffic-report", organizationId, days],
    enabled: !!organizationId,
    queryFn: () => report({ data: { organizationId: organizationId!, days: Number(days) } }),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      saveAlerts({ data: { organizationId: organizationId!, enabled } }),
    onSuccess: (result) => {
      setAlerts(result.enabled);
      toast.success(result.enabled ? "Traffic alerts on" : "Traffic alerts off");
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const summary = query.data?.summary;
  const issues = query.data?.issues ?? [];

  return (
    <div className="space-y-6">
      <Panel>
        <SectionHeading
          eyebrow="Website traffic"
          title="Who's visiting your site"
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                aria-label="Refresh traffic"
              >
                {query.isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </div>
          }
        />

        <div className="mt-4 flex flex-wrap gap-1.5">
          {TRAFFIC_RANGES.map((range) => (
            <Button
              key={range.value}
              size="sm"
              variant={days === range.value ? "signal" : "outline"}
              onClick={() => setDays(range.value)}
            >
              {range.label}
            </Button>
          ))}
        </div>

        {query.isLoading || !summary ? (
          <p className="mt-6 text-[13px] text-muted-foreground">Reading your traffic…</p>
        ) : (
          <>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Visits" value={summary.views}>
                {summary.changePct !== null ? (
                  <span
                    className={`flex items-center gap-1 text-[11px] ${
                      summary.changePct >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {summary.changePct >= 0 ? (
                      <TrendingUp className="size-3.5" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="size-3.5" aria-hidden="true" />
                    )}
                    {Math.abs(summary.changePct)}% vs previous
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    No earlier period to compare
                  </span>
                )}
              </Stat>
              <Stat label="Unique sessions" value={summary.visitors} />
              <Stat label="Enquiries" value={summary.conversions} />
              <Stat label="Enquiry rate" value={`${summary.conversionRate}%`} />
            </dl>

            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <List
                title="Where they came from"
                rows={summary.sources}
                empty="No sources recorded yet."
              />
              <List title="Most visited pages" rows={summary.pages} empty="No page views yet." />
              <List title="Device" rows={summary.devices} empty="No device data yet." />
            </div>

            {!summary.hasEnoughData ? (
              <p className="mt-5 text-[12px] text-muted-foreground">
                Fewer than 20 visits in this period — treat the percentages as early signals rather
                than trends.
              </p>
            ) : null}
          </>
        )}
      </Panel>

      <Panel>
        <SectionHeading
          eyebrow="Problems and fixes"
          title={
            issues.length
              ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to look at`
              : "Nothing needs attention"
          }
        />
        {issues.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted-foreground">
            Your site is published, capturing enquiries and serving securely. Revora keeps watching
            and tells you the moment that changes.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {issues.map((issue: TrafficIssue) => (
              <li key={issue.key} className="rounded-md border border-border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={severityTone(issue.severity) as "danger" | "attention" | "info"}>
                    {issue.severity === "critical"
                      ? "Fix now"
                      : issue.severity === "warning"
                        ? "Worth fixing"
                        : "Note"}
                  </Pill>
                  <p className="text-[14px] font-medium">{issue.title}</p>
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">{issue.detail}</p>
                <p className="mt-1 text-[13px]">{issue.fix}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to={issue.href}>
                    Go fix it <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2.5">
            <BellRing className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="traffic-alerts" className="text-[13px]">
              Notify me when something breaks or traffic drops
            </Label>
            <Switch
              id="traffic-alerts"
              checked={alerts}
              disabled={!canManage || toggle.isPending}
              onCheckedChange={(value) => toggle.mutate(value)}
            />
          </div>
          {query.data?.checkedAt ? (
            <p className="text-[11px] text-muted-foreground">
              Last checked {dateLong(query.data.checkedAt)}
            </p>
          ) : null}
        </div>
        {query.data?.notified ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {query.data.notified} alert{query.data.notified === 1 ? "" : "s"} added to your
            notifications.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum mt-1 font-display text-[24px] font-semibold">{value}</dd>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

function List({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; total: number }[];
  empty: string;
}) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {rows.map((row) => (
            <li key={row.name} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-muted-foreground">{row.name}</span>
              <span className="tnum font-medium">{row.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
