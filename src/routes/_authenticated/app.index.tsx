import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import {
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
  LoadingRows,
  EmptyState,
  KeyLabel,
} from "@/components/app/Bits";
import { OnboardingJourney } from "@/components/app/OnboardingJourney";
import { ProductionSummaryCard } from "@/components/app/ProductionLaunch";
import { StatusCenter } from "@/components/app/StatusCenter";
import { ActivityFeed } from "@/components/app/ActivityFeed";
import { RevoraCommandBar } from "@/components/app/RevoraCommandBar";
import { ClientWebsiteSummary } from "@/components/app/ClientWebsiteSummary";

import { useProductionStatus } from "@/lib/production.hooks";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/lib/use-tenant";
import {
  useAnalytics,
  useAppointments,
  useBusinessProfile,
  useCustomers,
  useLeads,
  useServices,
} from "@/lib/queries";
import { currency, dateShort, relative, timeShort } from "@/lib/format";
import { leadStatusMeta } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Growth Center — Revora" },
      {
        name: "description",
        content: "Leads, bookings, revenue and conversion for any date range.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const DAY = 86_400_000;

const SYSTEM_SECTIONS = [
  {
    to: "/app/website",
    title: "Website builder",
    description: "Edit pages, sections and copy. Every change publishes to your live site.",
    key: true,
  },
  {
    to: "/app/command",
    title: "AI Command Center",
    description: "Scans your site and hands you one-click fixes that lift conversion.",
    key: true,
  },
  {
    to: "/app/leads",
    title: "Leads & CRM",
    description: "Work every enquiry from new to won on one board with full history.",
    key: true,
  },
  {
    to: "/app/quotes",
    title: "Quote calculator",
    description: "Visitors price their job instantly and land in your pipeline.",
    key: false,
  },
  {
    to: "/app/calendar",
    title: "Calendar & bookings",
    description: "Customers book real time slots that fit your working hours.",
    key: false,
  },
  {
    to: "/app/automations",
    title: "Automations",
    description: "Instant replies and follow-ups so no lead goes cold.",
    key: false,
  },
  {
    to: "/app/reviews",
    title: "Reviews",
    description: "Request reviews after each job and show your best ones on site.",
    key: false,
  },
  {
    to: "/app/domain",
    title: "Domain & SSL",
    description: "Connect your own domain with a secure certificate.",
    key: false,
  },
  {
    to: "/app/launch",
    title: "Launch checklist",
    description: "Final checks before your site goes live to customers.",
    key: true,
  },
] as const;

const RANGES = [
  { value: "1", label: "Today", days: 1 },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "custom", label: "Custom", days: 30 },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const RANGE_KEY = "revora.dashboard.range";

function Dashboard() {
  const { data: ws } = useWorkspace();
  const { data: production } = useProductionStatus(ws?.workspace?.organizationId);
  const orgId = ws?.workspace?.organizationId;
  const org = ws?.workspace?.organization;

  const [range, setRange] = useState<RangeValue>("30");
  const [customFrom, setCustomFrom] = useState(() =>
    new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10),
  );
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Remember the range the owner last looked at (client-only, avoids hydration mismatch).
  useEffect(() => {
    const saved = globalThis.localStorage.getItem(RANGE_KEY);
    if (saved && RANGES.some((r) => r.value === saved)) setRange(saved as RangeValue);
  }, []);
  useEffect(() => {
    globalThis.localStorage.setItem(RANGE_KEY, range);
  }, [range]);

  const window = useMemo(() => {
    if (range === "custom") {
      const from = new Date(`${customFrom}T00:00:00`);
      const to = new Date(`${customTo}T23:59:59`);
      const valid = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to;
      const safeFrom = valid ? from : new Date(Date.now() - 30 * DAY);
      const safeTo = valid ? to : new Date();
      return {
        from: safeFrom,
        to: safeTo,
        label: `${dateShort(safeFrom.toISOString())} – ${dateShort(safeTo.toISOString())}`,
        days: Math.max(1, Math.round((safeTo.getTime() - safeFrom.getTime()) / DAY)),
      };
    }
    const days = RANGES.find((r) => r.value === range)!.days;
    const from = days === 1 ? startOfToday() : new Date(Date.now() - days * DAY);
    return {
      from,
      to: new Date(),
      label: RANGES.find((r) => r.value === range)!.label,
      days,
    };
  }, [range, customFrom, customTo]);

  const leadsQuery = useLeads(orgId);
  const apptsQuery = useAppointments(orgId);
  const analyticsQuery = useAnalytics(orgId, Math.min(365, window.days * 2 + 1));
  const servicesQuery = useServices(orgId);
  const profileQuery = useBusinessProfile(orgId);
  const customersQuery = useCustomers(orgId);

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const appts = useMemo(() => apptsQuery.data ?? [], [apptsQuery.data]);
  const events = useMemo(() => analyticsQuery.data ?? [], [analyticsQuery.data]);

  const stats = useMemo(() => {
    const fromMs = window.from.getTime();
    const toMs = window.to.getTime();
    const span = Math.max(DAY, toMs - fromMs);
    const prevFrom = fromMs - span;

    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= fromMs && t <= toMs;
    };
    const inPrev = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= prevFrom && t < fromMs;
    };

    const rangeLeads = leads.filter((l) => inRange(l.created_at));
    const prevLeads = leads.filter((l) => inPrev(l.created_at));
    const rangeAppts = appts.filter((a) => inRange(a.starts_at));
    const bookedAppts = rangeAppts.filter(
      (a) => a.status !== "cancelled" && a.status !== "no_show",
    );
    const completedAppts = rangeAppts.filter((a) => a.status === "completed");
    const views = events.filter(
      (e) => e.event_type === "page_view" && inRange(e.created_at),
    ).length;
    const calls = events.filter(
      (e) => e.event_type === "call_click" && inRange(e.created_at),
    ).length;

    const revenueWon = leads
      .filter((l) => l.status === "completed" && inRange(l.created_at))
      .reduce((sum, l) => sum + Number(l.estimated_value ?? 0), 0);
    const pipeline = leads
      .filter((l) => !["completed", "lost"].includes(l.status))
      .reduce((sum, l) => sum + Number(l.estimated_value ?? 0), 0);

    const bookedLeads = rangeLeads.filter((l) => ["booked", "completed"].includes(l.status)).length;

    const needsAttention = leads.filter(
      (l) => (l.status === "new" || l.status === "contacted") && !l.last_contacted_at,
    );

    const upcoming = appts
      .filter((a) => new Date(a.starts_at).getTime() > Date.now() && a.status !== "cancelled")
      .slice(0, 5);

    const delta =
      prevLeads.length === 0
        ? rangeLeads.length > 0
          ? 100
          : 0
        : Math.round(((rangeLeads.length - prevLeads.length) / prevLeads.length) * 100);

    // Lead volume split into equal buckets across the selected range.
    const buckets = Math.min(12, Math.max(4, window.days));
    const bucketMs = span / buckets;
    const trend = Array.from({ length: buckets }, (_, i) => {
      const start = fromMs + i * bucketMs;
      const end = i === buckets - 1 ? toMs + 1 : start + bucketMs;
      const count = rangeLeads.filter((l) => {
        const t = new Date(l.created_at).getTime();
        return t >= start && t < end;
      }).length;
      return { start, count };
    });

    return {
      leads: rangeLeads.length,
      prevLeads: prevLeads.length,
      delta,
      trend,

      views,
      calls,
      visitorConversion: views > 0 ? (rangeLeads.length / views) * 100 : 0,
      leadToBooking: rangeLeads.length > 0 ? (bookedLeads / rangeLeads.length) * 100 : 0,
      bookings: bookedAppts.length,
      completed: completedAppts.length,
      revenueWon,
      pipeline,
      needsAttention,
      upcoming,
      recent: rangeLeads.slice(0, 8),
      avgJob:
        rangeLeads.length > 0
          ? rangeLeads.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0) / rangeLeads.length
          : 0,
    };
  }, [leads, appts, events, window]);

  const checklist = [
    { done: !!profileQuery.data?.phone, label: "Add your phone number", to: "/app/settings" },
    {
      done: (servicesQuery.data ?? []).length > 0,
      label: "Add your services",
      to: "/app/services",
    },
    {
      done: !!profileQuery.data?.description,
      label: "Write your About section",
      to: "/app/website",
    },
    { done: !!org?.conversion_goal, label: "Pick your main conversion goal", to: "/app/settings" },
  ];
  const peak = stats.trend.reduce(
    (best, b) => (b.count > best.count ? b : best),
    stats.trend[0] ?? { start: Date.now(), count: 0 },
  );
  const remaining = checklist.filter((c) => !c.done);

  if (leadsQuery.isLoading || !orgId) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <RevoraCommandBar />
      <div className="space-y-3">
        <PageHead
          eyebrow="Business growth center"
          title={org?.name ?? "Your business"}
          purpose={`${window.label} · updated ${relative(new Date())}`}
          action={
            <Button asChild size="sm" variant="signal" className="shrink-0">
              <Link to="/app/leads">
                Work leads <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        />

        <div
          role="group"
          aria-label="Date range"
          className="-mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={cn(
                "shrink-0 cursor-pointer snap-start rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                range === r.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <StatusCenter organizationId={orgId} />
      <ActivityFeed organizationId={orgId} />

      <ClientWebsiteSummary
        organizationId={orgId}
        slug={org?.slug ?? null}
        leads={leads.length}
        bookings={appts.filter((a) => a.status !== "cancelled").length}
        visits={events.filter((e) => e.event_type === "page_view").length}
      />

      <ProductionSummaryCard status={production} />

      <OnboardingJourney />

      {range === "custom" ? (
        <Panel className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
            <p className="text-[12px] text-muted-foreground">
              Comparing against the {window.days} days before this range.
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="panel-inset panel p-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <p className="eyebrow flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-primary" />
              <span className="text-primary/90">New leads · {window.label.toLowerCase()}</span>
              <KeyLabel>Key number</KeyLabel>
            </p>
            <p className="tnum mt-2 font-display text-[42px] leading-none font-semibold text-primary">
              {stats.leads}
            </p>
            <p className={`mt-2 text-xs ${stats.delta >= 0 ? "text-primary" : "text-destructive"}`}>
              {stats.delta >= 0 ? "▲" : "▼"} {Math.abs(stats.delta)}% vs previous {window.days} day
              {window.days === 1 ? "" : "s"} ({stats.prevLeads})
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Every lead here came from your Revora website, quote calculator or booking form.
            </p>
          </div>
          <div className="grid gap-4 sm:text-right md:grid-cols-2">
            <div>
              <p className="eyebrow">Revenue won</p>
              <p className="tnum mt-1.5 font-display text-[22px] font-semibold">
                <span className="gold-mark">{currency(stats.revenueWon)}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">completed jobs in range</p>
            </div>
            <div>
              <p className="eyebrow">Open pipeline</p>
              <p className="tnum mt-1.5 font-display text-[22px] font-semibold">
                {currency(stats.pipeline)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">still winnable right now</p>
            </div>
          </div>
        </div>
      </div>

      <Panel className="p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Leads over {window.label.toLowerCase()}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {stats.leads === 0
                ? "No leads captured in this range yet."
                : `Busiest stretch: ${peak.count} lead${peak.count === 1 ? "" : "s"} around ${dateShort(new Date(peak.start).toISOString())}.`}
            </p>
          </div>
          <span className="tnum shrink-0 text-[11px] text-muted-foreground">
            {stats.trend.length} pts
          </span>
        </div>
        <div className="mt-4 flex h-24 items-end gap-1.5" aria-hidden="true">
          {stats.trend.map((b) => (
            <div
              key={b.start}
              className={cn(
                "flex-1 rounded-sm transition-colors",
                b.count > 0 && b.count === peak.count ? "bg-primary" : "bg-primary/30",
              )}
              style={{
                height: `${peak.count > 0 ? Math.max(3, (b.count / peak.count) * 100) : 3}%`,
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] text-muted-foreground">
          <span>{dateShort(window.from.toISOString())}</span>
          <span>{dateShort(window.to.toISOString())}</span>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Bookings"
          value={String(stats.bookings)}
          hint={`${stats.completed} completed in range`}
          tone="signal"
          badge="Key"
        />
        <MetricCard
          label="Visitor → lead"
          value={`${stats.visitorConversion.toFixed(1)}%`}
          hint={`${stats.views} website visitors`}
          tone="attention"
          progress={stats.visitorConversion * 10}
        />
        <MetricCard
          label="Lead → booking"
          value={`${stats.leadToBooking.toFixed(0)}%`}
          hint="leads that reached the calendar"
          tone="info"
          progress={stats.leadToBooking}
        />
        <MetricCard
          label="Average job value"
          value={currency(stats.avgJob)}
          hint={`${stats.calls} call button clicks`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Needs follow-up"
          value={String(stats.needsAttention.length)}
          hint={stats.needsAttention.length ? "nobody has replied yet" : "all caught up"}
          tone={stats.needsAttention.length ? "attention" : "signal"}
        />
        <MetricCard
          label="Customers"
          value={String((customersQuery.data ?? []).length)}
          hint="lifetime, all sources"
        />
        <MetricCard
          label="Upcoming jobs"
          value={String(stats.upcoming.length)}
          hint="next on the calendar"
        />
        <MetricCard
          label="Total leads"
          value={String(leads.length)}
          hint="all time in your pipeline"
        />
      </div>

      <Panel className="p-5">
        <SectionHeading
          eyebrow="Your growth system"
          title="Everything running for your business"
          description="Each part of Revora is live and connected — gold labels mark the sections that win you the most work."
        />
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {SYSTEM_SECTIONS.map((section) => (
            <li key={section.to}>
              <Link
                to={section.to}
                className="panel card-lift block h-full p-3.5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-display text-[13.5px] font-semibold">
                    {section.title}
                  </p>
                  {section.key ? <KeyLabel className="shrink-0">Key</KeyLabel> : null}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {section.description}
                </p>
                <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold tracking-[0.08em] text-primary uppercase">
                  Open <ArrowRight className="size-3.5" aria-hidden="true" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {remaining.length ? (
        <Panel className="p-5">
          <SectionHeading eyebrow="Finish setup" title={`${remaining.length} steps left`} />
          <ul className="mt-4 space-y-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[13px]">
                  {item.done ? (
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className={item.done ? "text-muted-foreground line-through" : ""}>
                    {item.label}
                  </span>
                </span>
                {item.done ? null : (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={item.to}>Fix</Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading
            eyebrow="Do this first"
            title="Leads waiting on you"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/leads">
                  All leads <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <ul className="mt-4 divide-y divide-border">
            {stats.needsAttention.slice(0, 5).map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{lead.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[lead.service_interest, relative(lead.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Pill tone={leadStatusMeta(lead.status).tone}>
                  {leadStatusMeta(lead.status).label}
                </Pill>
              </li>
            ))}
            {stats.needsAttention.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-muted-foreground">
                Every lead has been contacted. That's how you win the job.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel className="p-5">
          <SectionHeading
            eyebrow="Calendar"
            title="Next appointments"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/calendar">
                  Calendar <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <ul className="mt-4 divide-y divide-border">
            {stats.upcoming.map((appt) => (
              <li key={appt.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{appt.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dateShort(appt.starts_at)} · {timeShort(appt.starts_at)}
                  </p>
                </div>
                <Pill tone={appt.status === "confirmed" ? "signal" : "attention"}>
                  {appt.status}
                </Pill>
              </li>
            ))}
            {stats.upcoming.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-muted-foreground">
                No upcoming appointments yet.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionHeading
          eyebrow={`Leads in ${window.label.toLowerCase()}`}
          title="Latest activity"
        />
        {stats.recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No leads in this range"
              description="Widen the date range, or share your website address to start capturing leads."
              action={
                <Button asChild variant="signal">
                  <Link to="/app/website">Set up your website</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {stats.recent.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{lead.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[lead.source, lead.service_interest, relative(lead.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="tnum text-[12px] text-muted-foreground">
                    {currency(Number(lead.estimated_value ?? 0))}
                  </span>
                  <Pill tone={leadStatusMeta(lead.status).tone}>
                    {leadStatusMeta(lead.status).label}
                  </Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
