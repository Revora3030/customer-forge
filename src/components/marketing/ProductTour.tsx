/**
 * Interactive product tour — clickable screens of the real Revora modules,
 * rendered as lightweight UI mockups so visitors can see the system before
 * signing up. Presentation only; all figures are clearly labelled examples.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, Calculator, Globe, LineChart, Users, Zap } from "lucide-react";
import { Panel, Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";

type ScreenKey = "site" | "crm" | "quote" | "booking" | "automation" | "analytics";

const TABS: { key: ScreenKey; label: string; icon: typeof Globe; outcome: string }[] = [
  { key: "site", label: "Your website", icon: Globe, outcome: "Get found and get called" },
  { key: "crm", label: "Lead pipeline", icon: Users, outcome: "No lead goes cold" },
  { key: "quote", label: "Instant quote", icon: Calculator, outcome: "Price jobs in seconds" },
  { key: "booking", label: "Booking", icon: CalendarCheck, outcome: "Jobs booked without calls" },
  { key: "automation", label: "Automations", icon: Zap, outcome: "Follow-up runs itself" },
  { key: "analytics", label: "Analytics", icon: LineChart, outcome: "Know what pays" },
];

const Row = ({
  left,
  mid,
  right,
  tone = "muted",
}: {
  left: string;
  mid: string;
  right: string;
  tone?: "muted" | "gold";
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0">
    <span className="min-w-0 flex-1 text-[12.5px] text-foreground">{left}</span>
    <span className="hidden min-w-0 flex-1 text-[13px] text-muted-foreground sm:block">{mid}</span>
    <span
      className={`tnum shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
        tone === "gold"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground"
      }`}
    >
      {right}
    </span>
  </div>
);

const Bars = ({ data }: { data: { label: string; value: number }[] }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-28 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div
            className="w-full rounded-t-sm bg-primary/60"
            style={{ height: `${Math.max(8, (d.value / max) * 100)}%` }}
            aria-hidden="true"
          />
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

function Screen({ view }: { view: ScreenKey }) {
  if (view === "site") {
    return (
      <div>
        <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2">
          <span className="font-display text-[13px] font-semibold">Northside Plumbing</span>
          <span className="flex gap-1.5">
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Call
            </span>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              Get quote
            </span>
          </span>
        </div>
        <div className="mt-3 rounded-md border border-border bg-background/40 p-4">
          <p className="font-display text-[15px] leading-tight font-semibold">
            AI-authored headline from supplied business facts
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Verified details, real services and owner-approved actions only.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Drain cleaning", "Water heaters", "Leak repair", "Repiping"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Service pages", "City pages", "Reviews block"].map((s) => (
            <div
              key={s}
              className="rounded-md border border-border bg-background/40 px-2 py-3 text-center text-[10.5px] text-muted-foreground"
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (view === "crm") {
    return (
      <div>
        <div className="grid grid-cols-4 gap-2">
          {[
            ["New", "6"],
            ["Contacted", "4"],
            ["Quoted", "3"],
            ["Booked", "2"],
          ].map(([label, count]) => (
            <div
              key={label}
              className="rounded-md border border-border bg-background/40 p-2 text-center"
            >
              <p className="tnum font-display text-[16px] font-semibold text-primary">{count}</p>
              <p className="text-[10.5px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Row left="Dana R. — water heater" mid="Follow up today" right="Quoted" tone="gold" />
          <Row left="Marcus T. — slab leak" mid="Auto-reply sent 2m ago" right="New" tone="gold" />
          <Row left="Priya S. — drain clog" mid="Booked Thu 9:00am" right="Booked" />
          <Row left="Alan B. — repipe estimate" mid="Reminder queued" right="Contacted" />
        </div>
      </div>
    );
  }
  if (view === "quote") {
    return (
      <div>
        <p className="eyebrow">Instant quote — customer view</p>
        <div className="mt-3 space-y-2">
          {[
            ["Service", "Water heater replacement"],
            ["Property", "Single family"],
            ["Urgency", "Within 48 hours"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-[13px]"
            >
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-primary/35 bg-primary/5 px-3 py-3">
          <p className="text-[11px] text-muted-foreground">Your estimated range</p>
          <p className="tnum gold-text font-display text-[22px] font-semibold">$1,450 – $2,100</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Example output from a configured quote calculator.
          </p>
        </div>
      </div>
    );
  }
  if (view === "booking") {
    return (
      <div>
        <p className="eyebrow">Availability — this week</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {["Tue", "Wed", "Thu", "Fri"].map((day) => (
            <div key={day} className="rounded-md border border-border bg-background/40 p-2">
              <p className="text-[11px] font-medium">{day}</p>
              <div className="mt-2 space-y-1.5">
                {["8:00", "11:30", "2:00"].map((slot, i) => (
                  <span
                    key={slot}
                    className={`block rounded px-1.5 py-1 text-center text-[10.5px] ${
                      i === 1 && day === "Thu"
                        ? "border border-primary/40 bg-primary/15 text-primary"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-[13px]">
          Priya booked Thu 11:30 — confirmation and reminder sent automatically.
        </p>
      </div>
    );
  }
  if (view === "automation") {
    return (
      <div className="space-y-2">
        {[
          ["New lead", "Instant alert + first reply", "Active"],
          ["No reply in 24h", "Follow-up with quote link", "Active"],
          ["Booking confirmed", "Confirmation + 24h reminder", "Active"],
          ["Job completed", "Review request", "Active"],
          ["Quiet 30 days", "Win-back offer", "Active"],
        ].map(([trigger, action, state]) => (
          <div
            key={trigger}
            className="flex items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
          >
            <Zap className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px]">{trigger}</span>
              <span className="block text-[11px] text-muted-foreground">{action}</span>
            </span>
            <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] text-primary">
              {state}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Visitors", "1,284"],
          ["Leads", "63"],
          ["Booked", "21"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-background/40 p-3">
            <p className="tnum font-display text-[17px] font-semibold text-primary">{value}</p>
            <p className="text-[10.5px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-border bg-background/40 p-3">
        <p className="eyebrow">Leads by source</p>
        <div className="mt-3">
          <Bars
            data={[
              { label: "Search", value: 28 },
              { label: "Maps", value: 17 },
              { label: "Direct", value: 9 },
              { label: "Social", value: 6 },
              { label: "Referral", value: 3 },
            ]}
          />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Example workspace data — your dashboard shows your own numbers.
      </p>
    </div>
  );
}

/** Tabbed, clickable tour of the Revora modules. */
export function ProductTour() {
  const [view, setView] = useState<ScreenKey>("site");
  const active = TABS.find((t) => t.key === view) ?? TABS[0]!;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8">
      <div>
        <Pill tone="signal">Product tour</Pill>
        <h3 className="mt-4 font-display text-[clamp(1.3rem,2.5vw,1.8rem)] leading-tight font-semibold">
          Click through the system you'd be getting.
        </h3>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Real modules, real screens. Pick any part of the customer journey and see exactly what it
          looks like once Revora is running for your business.
        </p>
        <div
          role="tablist"
          aria-label="Revora product screens"
          className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1"
        >
          {TABS.map(({ key, label, icon: Icon, outcome }) => {
            const selected = key === view;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setView(key)}
                className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? "gold-glow border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <Icon
                  className={`size-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span
                    className={`block text-[12.5px] font-medium ${selected ? "text-primary" : ""}`}
                  >
                    {label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{outcome}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link to="/demo/dashboard">
            Open the full live demo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <Panel className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <p className="font-display text-[13px] font-semibold">{active.label}</p>
          <span className="rounded-full border border-primary/35 bg-primary/10 px-2.5 py-0.5 text-[10.5px] text-primary">
            {active.outcome}
          </span>
        </div>
        <div className="mt-4 min-w-0">
          <Screen view={view} />
        </div>
      </Panel>
    </div>
  );
}
