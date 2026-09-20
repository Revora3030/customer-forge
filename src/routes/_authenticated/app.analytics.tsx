import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LoadingRows, MetricCard, Panel, SectionHeading } from "@/components/app/Bits";
import { useAnalytics, useAppointments, useLeads } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { DATE_RANGES, sourceLabel } from "@/lib/domain";
import { currency, dateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConversionOptimizer } from "@/components/app/ConversionOptimizer";
import { TrafficMonitor } from "@/components/app/TrafficMonitor";
import { SitePerformance } from "@/components/app/SitePerformance";
import { canManage } from "@/lib/domain";
import { useWebsiteSettings } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Revora" },
      { name: "description", content: "Traffic, leads, bookings and conversion by source." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyticsPage,
});

const DAY = 86_400_000;

function AnalyticsPage() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const [days, setDays] = useState(30);
  const { data: events, isLoading } = useAnalytics(orgId, days);
  const { data: leads } = useLeads(orgId);
  const { data: appointments } = useAppointments(orgId);
  const settingsQuery = useWebsiteSettings(orgId);

  const model = useMemo(() => {
    const since = Date.now() - days * DAY;
    const rows = events ?? [];
    const views = rows.filter((e) => e.event_type === "page_view");
    const periodLeads = (leads ?? []).filter((l) => new Date(l.created_at).getTime() >= since);
    const periodBookings = (appointments ?? []).filter(
      (a) => new Date(a.starts_at).getTime() >= since && a.status !== "cancelled",
    );

    const daily = Array.from({ length: Math.min(days, 30) }, (_, index) => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - (Math.min(days, 30) - 1 - index));
      const dayEnd = dayStart.getTime() + DAY;
      return {
        date: dayStart,
        views: views.filter((e) => {
          const t = new Date(e.created_at).getTime();
          return t >= dayStart.getTime() && t < dayEnd;
        }).length,
        leads: periodLeads.filter((l) => {
          const t = new Date(l.created_at).getTime();
          return t >= dayStart.getTime() && t < dayEnd;
        }).length,
      };
    });

    const bySource = new Map<string, { views: number; leads: number }>();
    for (const event of views) {
      const key = event.source ?? "direct";
      const entry = bySource.get(key) ?? { views: 0, leads: 0 };
      entry.views += 1;
      bySource.set(key, entry);
    }
    for (const lead of periodLeads) {
      const key = lead.source ?? "direct";
      const entry = bySource.get(key) ?? { views: 0, leads: 0 };
      entry.leads += 1;
      bySource.set(key, entry);
    }

    const actions = ["call_click", "quote_start", "quote_complete", "booking_start", "form_submit"];
    const byAction = actions.map((action) => ({
      action,
      count: rows.filter((e) => e.event_type === action).length,
    }));

    const revenue = periodLeads
      .filter((l) => l.status === "completed" || l.status === "booked")
      .reduce((sum, l) => sum + Number(l.estimated_value ?? 0), 0);

    return {
      views: views.length,
      leads: periodLeads.length,
      bookings: periodBookings.length,
      revenue,
      conversion: views.length ? (periodLeads.length / views.length) * 100 : 0,
      daily,
      sources: [...bySource.entries()].sort((a, b) => b[1].leads - a[1].leads),
      byAction,
      maxDaily: Math.max(1, ...daily.map((d) => d.views)),
    };
  }, [events, leads, appointments, days]);

  if (isLoading) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Results</p>
          <h1 className="mt-1 font-display text-[24px] font-semibold">Analytics</h1>
        </div>
        <div className="flex gap-1.5">
          {DATE_RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              onClick={() => setDays(Number(range.value))}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-[12px]",
                days === Number(range.value)
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Page views"
          value={String(model.views)}
          hint="every page opened — one session can open several"
        />
        <MetricCard label="Leads" value={String(model.leads)} tone="signal" hint="captured" />
        <MetricCard
          label="Bookings"
          value={String(model.bookings)}
          tone="signal"
          hint="scheduled"
        />
        <MetricCard
          label="Conversion"
          value={`${model.conversion.toFixed(1)}%`}
          tone="attention"
          hint="visitor → lead"
          progress={model.conversion * 10}
        />
        <MetricCard label="Booked value" value={currency(model.revenue)} hint="from won leads" />
      </div>

      <Panel className="p-5">
        <SectionHeading
          eyebrow="Trend"
          title="Unique sessions and leads per day"
          description="A unique session is one browsing visit to your site."
        />
        <div className="mt-5 flex h-40 items-end gap-1" aria-hidden="true">
          {model.daily.map((day) => (
            <div key={day.date.toISOString()} className="flex flex-1 flex-col justify-end gap-0.5">
              <div
                className="rounded-sm bg-primary"
                style={{ height: `${(day.leads / model.maxDaily) * 100}%` }}
              />
              <div
                className="rounded-sm bg-primary/25"
                style={{ height: `${(day.views / model.maxDaily) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{dateShort(model.daily[0]?.date)}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-primary" aria-hidden="true" /> Leads
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-primary/25" aria-hidden="true" /> Views
            </span>
          </span>
          <span>{dateShort(model.daily.at(-1)?.date)}</span>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading eyebrow="Where they come from" title="Traffic sources" />
          <ul className="mt-4 divide-y divide-border">
            {model.sources.map(([source, stats]) => (
              <li key={source} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[13px]">{sourceLabel(source)}</span>
                <span className="tnum text-[12px] text-muted-foreground">
                  {stats.views} views · <span className="text-primary">{stats.leads} leads</span>
                </span>
              </li>
            ))}
            {model.sources.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-muted-foreground">
                No traffic recorded in this period yet.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel className="p-5">
          <SectionHeading eyebrow="Intent" title="What visitors clicked" />
          <ul className="mt-4 space-y-3">
            {model.byAction.map((row) => (
              <li key={row.action}>
                <div className="flex items-center justify-between text-[13px]">
                  <span>{row.action.replace(/_/g, " ")}</span>
                  <span className="tnum text-muted-foreground">{row.count}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (row.count / Math.max(1, ...model.byAction.map((r) => r.count))) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <SitePerformance organizationId={orgId} days={days} />

      <TrafficMonitor
        organizationId={orgId}
        alertsEnabled={
          (settingsQuery.data as { traffic_alerts_enabled?: boolean | null } | undefined)
            ?.traffic_alerts_enabled !== false
        }
        canManage={canManage(ws?.workspace?.role ?? "viewer")}
      />

      <ConversionOptimizer organizationId={orgId} />
    </div>
  );
}
