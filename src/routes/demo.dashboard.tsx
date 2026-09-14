import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  Info,
  Mail,
  MessageSquare,
  Phone,
  Repeat,
  Star,
  UserPlus,
  Zap,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { FunnelChart, Sparkline, TrendChart } from "@/components/demo/DemoCharts";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/offer";
import {
  buildDemoWorkspace,
  demoActivity,
  demoFunnel,
  demoMetrics,
  demoPipeline,
  demoSeries,
  formatAgo,
  DEMO_DISCLOSURE,
  DEMO_RANGES,
  DEMO_STAGES,
  STAGE_TONE,
  stageLabel,
  type DemoLead,
  type DemoRangeId,
  type DemoStage,
} from "@/lib/demo-workspace";

export const Route = createFileRoute("/demo/dashboard")({
  head: () => ({
    meta: [
      { title: "Revora demo dashboard — leads, quotes, bookings, reviews" },
      {
        name: "description",
        content:
          "Explore an interactive Revora dashboard with clearly labelled demo data: pipeline stages, quotes, automated follow-ups, bookings, reviews and traffic sources.",
      },
      { property: "og:title", content: "Revora demo dashboard (demo data)" },
      {
        property: "og:description",
        content:
          "Interactive walkthrough of the Revora dashboard using fictional demo data — visitor to lead, quote, follow-up, booking, review and repeat.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://revoragrowthsystems.com/demo/dashboard" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://revoragrowthsystems.com/demo/dashboard" }],
  }),
  component: DemoDashboard,
});

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline" },
  { id: "bookings", label: "Calendar" },
  { id: "automations", label: "Follow-ups" },
  { id: "reviews", label: "Reviews" },
  { id: "traffic", label: "Traffic" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ACTIVITY_ICON = {
  lead: UserPlus,
  quote: Mail,
  message: MessageSquare,
  booking: CalendarCheck,
  payment: CreditCard,
  review: Star,
} as const;

function DemoBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-[13px] leading-relaxed text-accent"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">LIVE PRODUCT DEMO.</span> All metrics shown are fictional
        demonstration data. {DEMO_DISCLOSURE}
      </p>
    </div>
  );
}

function LiveDot() {
  return (
    <span aria-hidden="true" className="relative inline-flex size-2">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function DemoDashboard() {
  const [workspace] = useState(() => buildDemoWorkspace());
  const [range, setRange] = useState<DemoRangeId>("30");
  const [tab, setTab] = useState<TabId>("overview");
  const [stageFilter, setStageFilter] = useState<DemoStage | "all">("all");
  const [selectedId, setSelectedId] = useState<string>(workspace.leads[2]?.id ?? "");

  const metrics = useMemo(() => demoMetrics(range), [range]);
  const rangeLabel = DEMO_RANGES.find((r) => r.id === range)?.label ?? "30 days";
  const series = useMemo(() => demoSeries(range), [range]);
  const funnel = useMemo(() => demoFunnel(range), [range]);
  const pipeline = useMemo(() => demoPipeline(range), [range]);
  const activity = useMemo(() => demoActivity(), []);
  const pipelineTotal = pipeline.reduce((sum, row) => sum + row.value, 0);

  const leads = useMemo(
    () =>
      stageFilter === "all"
        ? workspace.leads
        : workspace.leads.filter((lead) => lead.stage === stageFilter),
    [workspace.leads, stageFilter],
  );

  const selected: DemoLead | undefined =
    leads.find((l) => l.id === selectedId) ?? leads[0] ?? workspace.leads[0];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="hero-aura border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="signal" className="uppercase tracking-[0.14em]">
                <LiveDot /> Live product demo
              </Pill>
              <Pill tone="attention">Fictional demo data</Pill>
              <Pill tone="neutral">Interactive</Pill>
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-[1.08] font-semibold tracking-tight">
              This is what running your business inside <span className="gold-text">Revora</span>{" "}
              looks like.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {workspace.business.name} — {workspace.business.tagline}.{" "}
              <span className="text-accent">
                All metrics shown are fictional demonstration data.
              </span>
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Every lead captured", value: "Instantly" },
                { label: "First reply time", value: `${metrics.responseMinutes} min` },
                { label: "Follow-ups", value: "Automatic" },
                { label: "Booked → review", value: "Hands-free" },
              ].map((item) => (
                <div key={item.label} className="panel card-lift p-3">
                  <p className="eyebrow">{item.label}</p>
                  <p className="mt-1 font-display text-[15px] font-semibold gold-hl">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="signal" size="lg">
                <Link to="/get-started">
                  START MY REVORA SYSTEM <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/s/$slug" params={{ slug: "elite-mobile-detailing" }}>
                  Open the demo business site
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8">
          <DemoBanner />

          {/* Controls */}
          <div className="sticky top-[4.25rem] z-20 -mx-4 mt-5 border-y border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Demo dashboard sections"
                className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-0.5"
              >
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    type="button"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                      tab === t.id
                        ? "border-primary/45 bg-primary/12 text-primary gold-glow"
                        : "border-border bg-elevated text-muted-foreground hover:-translate-y-px hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5" aria-label="Demo date range">
                {DEMO_RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={range === r.id}
                    onClick={() => setRange(r.id)}
                    className={`rounded-md border px-2.5 py-1.5 text-[13px] transition-colors ${
                      range === r.id
                        ? "border-primary/40 bg-primary/12 text-primary"
                        : "border-border bg-elevated text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tab === "overview" ? (
            <div key={range} className="reveal mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label={`Leads · last ${rangeLabel}`}
                  value={String(metrics.leads)}
                  hint="Demo data"
                  tone="signal"
                  progress={72}
                />
                <MetricCard
                  label="Booked jobs"
                  value={String(metrics.booked)}
                  hint={`${metrics.conversion}% of leads booked (demo)`}
                  tone="info"
                  progress={metrics.conversion}
                />
                <MetricCard
                  label="Quotes sent"
                  value={String(metrics.quotes)}
                  hint={`${usd(metrics.quoteValue)} quoted (demo)`}
                  tone="attention"
                  progress={64}
                />
                <MetricCard
                  label="Booked value"
                  value={usd(metrics.bookedValue)}
                  hint={`Avg quote ${usd(metrics.avgQuote)} (demo)`}
                  tone="signal"
                  progress={48}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Follow-ups sent"
                  value={String(metrics.followUps)}
                  hint="Email + SMS (demo)"
                />
                <MetricCard
                  label="Site visitors"
                  value={String(metrics.visitors)}
                  hint="All sources (demo)"
                />
                <MetricCard
                  label="Reviews left"
                  value={`${metrics.reviewsLeft}/${metrics.reviewsRequested}`}
                  hint="Requested automatically (demo)"
                />
                <MetricCard
                  label="Repeat customers"
                  value={`${metrics.repeatRate}%`}
                  hint="Rebooked within 90 days (demo)"
                />
              </div>

              <Panel>
                <SectionHeading
                  eyebrow={`Demo performance · last ${rangeLabel}`}
                  title="Leads and booked jobs over time"
                  action={
                    <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
                      <LiveDot /> demo data
                    </span>
                  }
                />
                <TrendChart points={series} />
              </Panel>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <Panel className="min-w-0">
                  <SectionHeading eyebrow="The full flow" title="Visitor to repeat customer" />
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    Visitor → Lead → Quote → Follow-up → Booking → Customer → Review → Repeat. Tap
                    any step to open those demo records in the pipeline.
                  </p>
                  <FunnelChart
                    rows={funnel}
                    activeId={stageFilter === "all" ? null : stageFilter}
                    onSelect={(id) => {
                      setStageFilter((prev) => (prev === id ? "all" : (id as DemoStage)));
                      setTab("pipeline");
                    }}
                  />
                </Panel>

                <div className="min-w-0 space-y-4">
                  <Panel>
                    <SectionHeading
                      eyebrow="Revenue pipeline"
                      title={`${usd(pipelineTotal)} in play (demo)`}
                    />
                    <ul className="mt-4 space-y-3">
                      {pipeline.map((row) => (
                        <li key={row.stage}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                              <Pill tone={row.tone}>{row.count}</Pill>
                              {row.stage}
                            </span>
                            <span className="tnum text-[13px] gold-hl">{usd(row.value)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                            <div
                              className={`h-full rounded-full transition-[width] duration-500 ${
                                row.tone === "signal"
                                  ? "bg-primary"
                                  : row.tone === "info"
                                    ? "bg-info"
                                    : "bg-accent"
                              }`}
                              style={{
                                width: `${Math.max(4, Math.round((row.value / Math.max(1, pipelineTotal)) * 100))}%`,
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>

                  <Panel>
                    <SectionHeading eyebrow="Activity feed" title="What the system just did" />
                    <ol className="mt-4 space-y-2.5">
                      {activity.slice(0, 6).map((entry) => {
                        const Icon = ACTIVITY_ICON[entry.kind];
                        return (
                          <li
                            key={entry.id}
                            className="flex items-start gap-2.5 rounded-md border border-border bg-elevated p-2.5 transition-colors hover:border-primary/30"
                          >
                            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                              <Icon className="size-3.5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium">{entry.title}</p>
                              <p className="text-[13px] text-muted-foreground">{entry.detail}</p>
                            </div>
                            <span className="tnum ml-auto shrink-0 text-[11px] text-muted-foreground">
                              {formatAgo(entry.minutesAgo)}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Activity className="size-3.5" aria-hidden="true" /> Simulated events — demo
                      data only.
                    </p>
                  </Panel>
                </div>
              </div>

              <Panel>
                <SectionHeading
                  eyebrow="What happens at each step"
                  title="Revora runs the whole loop"
                />
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {DEMO_STAGES.map((stage) => {
                    const count = workspace.leads.filter((l) => l.stage === stage.id).length;
                    return (
                      <li
                        key={stage.id}
                        className="card-lift rounded-md border border-border bg-elevated p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold">{stage.label}</p>
                          <Pill tone={STAGE_TONE[stage.id]}>{count}</Pill>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                          {stage.blurb}
                        </p>
                        <div className="mt-2">
                          <Sparkline
                            values={series.slice(-10).map((p) => p.leads)}
                            tone={STAGE_TONE[stage.id] === "info" ? "info" : "primary"}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          ) : null}

          {tab === "pipeline" ? (
            <div className="reveal mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Panel>
                <SectionHeading
                  eyebrow={`Demo pipeline · ${leads.length} records`}
                  title={
                    stageFilter === "all" ? "All demo leads" : `Stage: ${stageLabel(stageFilter)}`
                  }
                  action={
                    stageFilter === "all" ? null : (
                      <Button variant="outline" size="sm" onClick={() => setStageFilter("all")}>
                        Clear filter
                      </Button>
                    )
                  }
                />
                <ul className="mt-4 space-y-2">
                  {leads.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(lead.id)}
                        aria-current={selected?.id === lead.id}
                        className={`w-full rounded-md border p-3 text-left transition-all duration-200 hover:-translate-y-px ${
                          selected?.id === lead.id
                            ? "border-primary/40 bg-primary/8"
                            : "border-border bg-elevated hover:border-primary/25"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold">{lead.name}</span>
                          <Pill tone={STAGE_TONE[lead.stage]}>{stageLabel(lead.stage)}</Pill>
                        </div>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {lead.service} · {lead.city}
                        </p>
                        <p className="tnum mt-1 text-[13px] text-muted-foreground">
                          {lead.quoteHigh > 0
                            ? `${usd(lead.quoteLow)} – ${usd(lead.quoteHigh)}`
                            : "No quote yet"}{" "}
                          ·{" "}
                          {lead.daysAgo === 0
                            ? "today"
                            : `${workspace.formatRelative(lead.daysAgo)}`}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>

              <div className="space-y-4">
                <Panel>
                  {selected ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-display text-[16px] font-semibold">{selected.name}</h2>
                        <Pill tone={STAGE_TONE[selected.stage]}>{stageLabel(selected.stage)}</Pill>
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {selected.service} · {selected.city}
                      </p>
                      <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
                        <div className="rounded-md border border-border bg-elevated p-2.5">
                          <dt className="eyebrow">Source</dt>
                          <dd className="mt-1 text-muted-foreground">{selected.source}</dd>
                        </div>
                        <div className="rounded-md border border-border bg-elevated p-2.5">
                          <dt className="eyebrow">Estimate</dt>
                          <dd className="tnum mt-1 text-muted-foreground">
                            {selected.quoteHigh > 0
                              ? `${usd(selected.quoteLow)} – ${usd(selected.quoteHigh)}`
                              : "Not quoted yet"}
                          </dd>
                        </div>
                        <div className="rounded-md border border-border bg-elevated p-2.5">
                          <dt className="eyebrow">Phone (masked)</dt>
                          <dd className="tnum mt-1 text-muted-foreground">
                            {selected.phoneMasked}
                          </dd>
                        </div>
                        <div className="rounded-md border border-border bg-elevated p-2.5">
                          <dt className="eyebrow">Email (masked)</dt>
                          <dd className="mt-1 text-muted-foreground">{selected.emailMasked}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 rounded-md border border-border bg-elevated p-2.5 text-[13px] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground">Note: </span>
                        {selected.note}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {[
                          { icon: Phone, label: "Call" },
                          { icon: MessageSquare, label: "Text" },
                          { icon: Mail, label: "Email" },
                          { icon: CalendarDays, label: "Book" },
                          { icon: Repeat, label: "Change stage" },
                        ].map(({ icon: Icon, label }) => (
                          <span
                            key={label}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-muted-foreground"
                          >
                            <Icon className="size-3.5" aria-hidden="true" />
                            {label}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Actions are disabled in the demo — in your workspace each one logs to the
                        lead's timeline.
                      </p>

                      <h3 className="mt-5 font-display text-[13px] font-semibold">
                        Activity timeline
                      </h3>
                      <ol className="mt-2 space-y-2">
                        {selected.activity.map((entry, i) => (
                          <li key={`${entry.label}-${i}`} className="flex gap-2.5">
                            <span
                              aria-hidden="true"
                              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                                entry.kind === "message"
                                  ? "bg-accent"
                                  : entry.kind === "human"
                                    ? "bg-info"
                                    : "bg-primary"
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-[13px] leading-relaxed">{entry.label}</p>
                              <p className="text-[11px] text-muted-foreground">{entry.at}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                </Panel>
                <DemoBanner />
              </div>
            </div>
          ) : null}

          {tab === "bookings" ? (
            <Panel className="reveal mt-5">
              <SectionHeading eyebrow="Demo calendar" title="Upcoming and completed jobs" />
              <ul className="mt-4 space-y-2">
                {workspace.bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="card-lift flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-elevated p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{booking.lead}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {booking.service} · {booking.tech}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-[13px]">
                        {workspace.formatAhead(booking.daysAhead)} · {booking.when}
                      </p>
                      <p className="tnum text-[13px] text-muted-foreground">{usd(booking.value)}</p>
                    </div>
                    <Pill
                      tone={
                        booking.status === "confirmed"
                          ? "signal"
                          : booking.status === "pending"
                            ? "attention"
                            : "info"
                      }
                    >
                      {booking.status}
                    </Pill>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Demo data. Confirmations and reminders send automatically in a live workspace.
              </p>
            </Panel>
          ) : null}

          {tab === "automations" ? (
            <Panel className="reveal mt-5">
              <SectionHeading
                eyebrow="Demo automations"
                title="Follow-up sequences that run themselves"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-[13px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Sequence</th>
                      <th className="pb-2 font-medium">Trigger</th>
                      <th className="pb-2 font-medium">Timing</th>
                      <th className="pb-2 font-medium">Channel</th>
                      <th className="pb-2 text-right font-medium">Sent</th>
                      <th className="pb-2 text-right font-medium">Replies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.automations.map((a) => (
                      <tr
                        key={a.name}
                        className="border-t border-border transition-colors hover:bg-elevated/60"
                      >
                        <td className="py-2.5 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Zap className="size-3.5 text-primary" aria-hidden="true" />
                            {a.name}
                          </span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{a.trigger}</td>
                        <td className="py-2.5 text-muted-foreground">{a.timing}</td>
                        <td className="py-2.5 text-muted-foreground">{a.channel}</td>
                        <td className="tnum py-2.5 text-right">{a.sent}</td>
                        <td className="tnum py-2.5 text-right text-primary">{a.replies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Demo data. Timing, wording and channels are configurable per business.
              </p>
            </Panel>
          ) : null}

          {tab === "reviews" ? (
            <Panel className="reveal mt-5">
              <SectionHeading eyebrow="Demo reviews" title="Review requests and responses" />
              <ul className="mt-4 space-y-2">
                {workspace.reviews.map((review) => (
                  <li
                    key={review.name}
                    className="card-lift rounded-md border border-border bg-elevated p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                        <BadgeCheck className="size-3.5 text-primary" aria-hidden="true" />
                        {review.name}
                      </span>
                      <span
                        className="inline-flex items-center gap-0.5"
                        aria-label={`${review.rating} of 5`}
                      >
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star
                            key={i}
                            className="size-3.5 fill-primary text-primary"
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {review.text}
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {review.service} · {workspace.formatRelative(review.daysAgo)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Placeholder review content for the demo — not real customer statements.
              </p>
            </Panel>
          ) : null}

          {tab === "traffic" ? (
            <Panel className="reveal mt-5">
              <SectionHeading
                eyebrow={`Demo traffic · last ${rangeLabel}`}
                title="Where the demo leads came from"
              />
              <ul className="mt-4 space-y-3">
                {workspace.traffic.map((row) => {
                  const factor = DEMO_RANGES.find((r) => r.id === range)?.factor ?? 1;
                  const visitors = Math.round(row.visitors * factor);
                  const leadCount = Math.max(1, Math.round(row.leads * factor));
                  const share = Math.round((row.visitors / 1551) * 100);
                  return (
                    <li key={row.source}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium">{row.source}</span>
                        <span className="tnum text-[13px] text-muted-foreground">
                          {visitors} visitors · {leadCount} leads
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, share)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Demo data. Live workspaces track real sources, campaigns and QR codes.
              </p>
            </Panel>
          ) : null}

          <Panel className="mt-6">
            <SectionHeading eyebrow="Next step" title="Want this running for your business?" />
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              $750 one-time setup, first month free, then $100/month from month two. We build it,
              connect it, launch it and keep optimizing it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="signal">
                <Link to="/get-started">
                  START MY REVORA SYSTEM <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/demo">Back to the demo walkthrough</Link>
              </Button>
            </div>
          </Panel>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
