/**
 * Makes Revora's AI concrete and shows the automation engine visually.
 *
 * Three additive blocks:
 *  - AiClarity: exactly what the AI does, in the client's words, with the human
 *    control that stays in place (no vague "AI-powered" claims).
 *  - AutomationFlow: the trigger -> action -> outcome visual.
 *  - SleepEngine: "your business grows while you sleep" framed as a mechanism.
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BellRing,
  Bot,
  CalendarCheck,
  ClipboardCheck,
  Layout,
  MoonStar,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
} from "lucide-react";
import { Panel, Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";

const AI_JOBS = [
  {
    icon: Layout,
    task: "Builds your website",
    detail:
      "You answer a short intake. The AI writes the pages, picks a design direction for your trade and assembles the site — then you approve or change anything.",
  },
  {
    icon: PenLine,
    task: "Writes your copy",
    detail:
      "Headlines, service descriptions, FAQs and calls to action written around your services, area and pricing. Rewrite any section by asking in plain English.",
  },
  {
    icon: Search,
    task: "Audits and improves the site",
    detail:
      "Scans your live pages for conversion, SEO, mobile, speed and accessibility gaps, then offers one-click upgrades with a rollback point before each change.",
  },
  {
    icon: Bot,
    task: "Answers and qualifies visitors",
    detail:
      "A site assistant answers common questions, collects the details a quote needs and hands the lead to your pipeline with the answers attached.",
  },
  {
    icon: ClipboardCheck,
    task: "Drafts quotes and replies",
    detail:
      "Turns a lead's answers into a priced quote draft and a first reply you can send in one tap.",
  },
  {
    icon: ShieldCheck,
    task: "Never acts behind your back",
    detail:
      "Every AI change is previewed, reversible and version-saved. You stay the approver — the AI does the work, not the deciding.",
  },
] as const;

/** "What the AI actually does" — crystal-clear, no hand-waving. */
export function AiClarity() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone="signal">
          <Sparkles className="size-3.5" aria-hidden="true" /> Revora AI
        </Pill>
        <p className="text-[12.5px] text-muted-foreground">
          Not a chatbot bolted onto a template — it builds, writes, audits and follows up.
        </p>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AI_JOBS.map(({ icon: Icon, task, detail }) => (
          <Panel key={task} className="card-lift p-5">
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <h3 className="mt-3.5 font-display text-[15px] font-semibold">{task}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
          </Panel>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/demo">
            Watch it work <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <p className="text-[13px] text-muted-foreground">
          AI drafts and suggests. <span className="gold-hl">You approve.</span> Every version is
          restorable.
        </p>
      </div>
    </div>
  );
}

const FLOW = [
  {
    icon: BellRing,
    when: "A lead lands",
    then: "Instant alert to your phone + an automatic first reply within seconds",
    outcome: "You answer before your competitor does",
  },
  {
    icon: Timer,
    when: "Nobody replies for 24h",
    then: "Follow-up sequence nudges the lead with your quote link",
    outcome: "Quiet leads come back instead of disappearing",
  },
  {
    icon: CalendarCheck,
    when: "A booking is made",
    then: "Confirmation + reminder go out and the job hits your calendar",
    outcome: "Fewer no-shows, zero scheduling calls",
  },
  {
    icon: Star,
    when: "A job is completed",
    then: "Review request sends automatically, then posts proof to your site",
    outcome: "Ranking and trust climb every month",
  },
] as const;

/** The automation engine as a visual: trigger -> action -> outcome. */
export function AutomationFlow() {
  return (
    <div>
      <ol className="grid gap-3 lg:grid-cols-4">
        {FLOW.map(({ icon: Icon, when, then, outcome }, index) => (
          <li key={when} className="relative">
            <Panel className="card-lift h-full p-5">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="tnum font-display text-[13px] text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <p className="eyebrow mt-4">Trigger</p>
              <h3 className="mt-1 font-display text-[15px] font-semibold">{when}</h3>
              <p className="eyebrow mt-4">Revora does</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{then}</p>
              <p className="mt-4 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-[12.5px] leading-snug text-foreground">
                {outcome}
              </p>
            </Panel>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[13px] text-muted-foreground">
        Every automation is on from launch day and runs whether you're on a roof, under a sink or
        asleep.
      </p>
    </div>
  );
}

const SLEEP_STEPS = [
  "11:40pm — someone searches your service in your city and lands on your Revora site",
  "11:42pm — they use the instant quote calculator and get a real price range",
  "11:43pm — the lead enters your CRM with their answers and an automatic reply goes out",
  "11:45pm — they book the first open slot on your calendar and get a confirmation",
  "7:02am — you open Revora to a new booked job and a follow-up already queued",
] as const;

/** "Growing while you sleep" presented as a concrete product mechanism. */
export function SleepEngine() {
  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
      <div>
        <Pill tone="signal">
          <MoonStar className="size-3.5" aria-hidden="true" /> The overnight engine
        </Pill>
        <h3 className="mt-4 font-display text-[clamp(1.35rem,2.6vw,1.9rem)] leading-tight font-semibold">
          Your business keeps selling <span className="gold-text">while you sleep</span>.
        </h3>
        <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
          This isn't a slogan — it's the mechanism. Your site answers, prices, captures and books
          without a human in the loop, and the follow-up runs on a schedule instead of memory. You
          wake up to booked work, not a list of missed calls.
        </p>
        <ul className="mt-5 space-y-2 text-[13px] text-muted-foreground">
          {[
            "Instant replies at any hour",
            "Follow-up, reminders and review requests on a timer",
            "Morning summary of what happened overnight",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <Panel className="p-5 sm:p-6">
        <p className="eyebrow">One night on autopilot</p>
        <ol className="mt-4 space-y-3">
          {SLEEP_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-primary/35 bg-primary/10 font-display text-[11px] font-semibold text-primary"
              >
                {index + 1}
              </span>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-[11.5px] text-muted-foreground">
          Illustrative timeline of the standard Revora flow — your real numbers appear in analytics.
        </p>
      </Panel>
    </div>
  );
}
