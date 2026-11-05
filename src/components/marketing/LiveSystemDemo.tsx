import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Calculator,
  MessageSquare,
  MousePointerClick,
  Repeat,
  Star,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoSiteButton } from "@/components/marketing/DemoSiteButton";
import { Pill } from "@/components/app/Bits";

type Stage = {
  id: string;
  label: string;
  icon: typeof MousePointerClick;
  headline: string;
  body: string;
  screen: () => React.ReactElement;
};

function Row({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "gold" | "success";
}) {
  const toneClass =
    tone === "gold" ? "text-primary" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2 last:border-b-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={`tnum text-[12.5px] font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

function ScreenShell({
  title,
  chip,
  children,
}: {
  title: string;
  chip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-inset overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-elevated px-3.5 py-2.5">
        <span className="eyebrow">{title}</span>
        <Pill tone="signal">{chip}</Pill>
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

const STAGES: Stage[] = [
  {
    id: "visitor",
    label: "Visitor",
    icon: MousePointerClick,
    headline: "A nearby customer finds you and lands on a site built to sell.",
    body: "Local SEO pages, fast load, and call / quote / book actions on every screen.",
    screen: () => (
      <ScreenShell title="yourbusiness.com — mobile" chip="Live site">
        <div className="rounded-md border border-primary/25 bg-primary/5 p-3.5">
          <p className="eyebrow">Raleigh, NC · Open today</p>
          <p className="mt-2 font-display text-[16px] leading-snug font-semibold">
            Same-day mobile detailing at your door
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["Call", "Get quote", "Book"].map((cta, i) => (
              <span
                key={cta}
                className={`rounded-md px-2 py-1.5 text-center text-[11px] font-semibold ${
                  i === 1
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground"
                }`}
              >
                {cta}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["Visitors", "1,240"],
            ["Source", "Google"],
            ["Load", "0.9s"],
          ].map(([l, v]) => (
            <div key={l} className="panel p-2.5">
              <p className="eyebrow">{l}</p>
              <p className="tnum mt-1 font-display text-[13px] font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </ScreenShell>
    ),
  },
  {
    id: "lead",
    label: "Lead",
    icon: UserPlus,
    headline: "The moment they act, a lead lands in your pipeline with context.",
    body: "Name, service, source and their answers — captured automatically, never in a DM.",
    screen: () => (
      <ScreenShell title="Revora CRM — new lead" chip="Captured">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[15px] font-semibold">Dana Reyes</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Interior + exterior detail</p>
          </div>
          <Pill tone="attention">New</Pill>
        </div>
        <div className="mt-3">
          <Row label="Source" value="Google → quote form" />
          <Row label="Vehicle" value="SUV · heavy soil" tone="gold" />
          <Row label="Response owed" value="Within 1 hour" tone="gold" />
        </div>
      </ScreenShell>
    ),
  },
  {
    id: "quote",
    label: "Quote",
    icon: Calculator,
    headline: "They get a real price range instantly. You get a qualified opportunity.",
    body: "Your pricing rules, add-ons and modifiers — no evening spent writing estimates.",
    screen: () => (
      <ScreenShell title="Instant quote calculator" chip="Estimated">
        <div className="rounded-md border border-primary/25 bg-primary/5 p-3.5 text-center">
          <p className="eyebrow">Estimated price range</p>
          <p className="tnum mt-1 font-display text-[26px] leading-none font-semibold text-primary">
            $220 – $285
          </p>
        </div>
        <div className="mt-3">
          <Row label="Base — full detail" value="$180" />
          <Row label="Vehicle size — SUV" value="+$40" />
          <Row label="Add-on — pet hair" value="+$45" tone="gold" />
        </div>
      </ScreenShell>
    ),
  },
  {
    id: "followup",
    label: "Follow-up",
    icon: MessageSquare,
    headline: "Quiet leads get nudged automatically, on your schedule.",
    body: "Email and text sequences fire off status changes so nobody goes cold.",
    screen: () => (
      <ScreenShell title="Automations — follow-up sequence" chip="Running">
        <div className="space-y-2">
          {[
            ["Instant", "Quote sent + confirmation", "Sent"],
            ["+1 day", "\u201cStill want that time slot?\u201d", "Sent"],
            ["+3 days", "Last-chance reminder", "Scheduled"],
          ].map(([when, what, state]) => (
            <div key={when} className="panel flex items-center justify-between gap-3 p-2.5">
              <div className="min-w-0">
                <p className="eyebrow">{when}</p>
                <p className="mt-1 text-[12.5px]">{what}</p>
              </div>
              <span
                className={`shrink-0 text-[11px] font-semibold ${
                  state === "Sent" ? "text-success" : "text-primary"
                }`}
              >
                {state}
              </span>
            </div>
          ))}
        </div>
      </ScreenShell>
    ),
  },
  {
    id: "booking",
    label: "Booking",
    icon: CalendarCheck,
    headline: "The job books itself onto your calendar while you work.",
    body: "Your availability, your buffers, confirmations sent both ways.",
    screen: () => (
      <ScreenShell title="Revora Bookings — Thursday" chip="Confirmed">
        <div className="grid grid-cols-4 gap-2">
          {["8:00", "9:30", "11:00", "1:30"].map((t, i) => (
            <div
              key={t}
              className={`rounded-md border p-2 text-center text-[11.5px] font-medium ${
                i === 1
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {t}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Row label="Dana Reyes · SUV detail" value="9:30a — 11:30a" tone="gold" />
          <Row label="Deposit" value="Paid" tone="success" />
          <Row label="Reminder" value="Text · 1h before" />
        </div>
      </ScreenShell>
    ),
  },
  {
    id: "review",
    label: "Review",
    icon: Star,
    headline: "After the job, the review request goes out for you.",
    body: "Happy customers are pointed public. Unhappy feedback stays private.",
    screen: () => (
      <ScreenShell title="Reputation — post-job request" chip="Sent">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="size-4 fill-primary text-primary" aria-hidden="true" />
          ))}
          <span className="ml-1 text-[13px] text-muted-foreground">new public review</span>
        </div>
        <div className="mt-3">
          <Row label="Requests sent this month" value="18" />
          <Row label="Public reviews collected" value="11" tone="gold" />
          <Row label="Private feedback routed to you" value="2" />
        </div>
      </ScreenShell>
    ),
  },
  {
    id: "repeat",
    label: "Repeat customer",
    icon: Repeat,
    headline: "Past customers get reactivated instead of forgotten.",
    body: "Full history, lifetime value and win-back campaigns in one profile.",
    screen: () => (
      <ScreenShell title="Customer profile — Dana Reyes" chip="Returning">
        <div className="mt-0">
          <Row label="Jobs completed" value="3" />
          <Row label="Lifetime value" value="$705" tone="gold" />
          <Row label="Next win-back campaign" value="In 60 days" />
          <Row label="Referrals" value="1" tone="success" />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          The same loop restarts — without you chasing it.
        </p>
      </ScreenShell>
    ),
  },
];

/**
 * The homepage wow moment: an interactive walk through the real Revora loop,
 * Visitor → Lead → Quote → Follow-Up → Booking → Review → Repeat Customer.
 * All figures are illustrative demo data, clearly labelled as such.
 */
export function LiveSystemDemo() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!auto) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    timer.current = setInterval(() => setActive((i) => (i + 1) % STAGES.length), 4200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto]);

  const stage = STAGES[active]!;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">The Revora loop</p>
          <h2 className="mt-2 max-w-2xl font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
            Watch a visitor become a <span className="gold-text">repeat customer</span>.
          </h2>
        </div>
        <Pill tone="attention">Illustrative demo data</Pill>
      </div>

      {/* Stage rail */}
      <div
        className="-mx-4 mt-7 overflow-x-auto px-4 pb-1"
        role="tablist"
        aria-label="Revora customer journey stages"
      >
        <div className="flex w-max items-center gap-1.5">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === active;
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  role="tab"
                  id={`stage-tab-${s.id}`}
                  aria-selected={isActive}
                  aria-controls={`stage-panel-${s.id}`}
                  onClick={() => {
                    setAuto(false);
                    setActive(i);
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "border-primary/50 bg-primary/12 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {s.label}
                </button>
                {i < STAGES.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`h-px w-4 ${i < active ? "bg-primary/60" : "bg-border"}`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div
        id={`stage-panel-${stage.id}`}
        role="tabpanel"
        aria-labelledby={`stage-tab-${stage.id}`}
        className="panel mt-5 grid gap-6 p-5 sm:p-7 lg:grid-cols-[0.95fr_1.05fr] lg:items-center"
      >
        <div key={`copy-${stage.id}`} className="reveal">
          <p className="tnum eyebrow">
            Step {String(active + 1).padStart(2, "0")} / {STAGES.length}
          </p>
          <h3 className="mt-3 font-display text-[clamp(1.15rem,2.2vw,1.5rem)] leading-snug font-semibold">
            {stage.headline}
          </h3>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            {stage.body}
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <Button asChild variant="signal">
              <Link to="/demo/dashboard">
                SEE REVORA IN ACTION <ArrowRight className="size-4" />
              </Link>
            </Button>
            <DemoSiteButton variant="outline">Open the live demo site</DemoSiteButton>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            The demo is a real Revora workspace. Every quote and booking you submit creates real
            records inside it.
          </p>
        </div>

        <div key={`screen-${stage.id}`} className="reveal">
          {stage.screen()}
        </div>
      </div>
    </div>
  );
}
