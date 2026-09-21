/**
 * Conversion + retention kit for the public marketing pages.
 *
 * Three additive pieces used by top-performing SaaS sites that Revora was
 * missing:
 *  - StickyCtaBar: a persistent, dismissible offer bar so the free-access CTA is
 *    always one tap away on mobile (where most local-business owners browse).
 *  - ExitIntentOffer: one polite, session-scoped reminder when a visitor is
 *    about to leave without starting.
 *  - LongTermValue: the "why businesses stay" proof block — what keeps
 *    compounding after launch.
 *
 * Everything is presentation-only. No existing behaviour is changed, and both
 * overlays hide themselves for signed-in clients.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LineChart, Repeat, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-session";
import { FREE_ACCESS_SEARCH, FREE_ACCESS_TO } from "@/components/marketing/FreeAccess";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";

const BAR_KEY = "revora:cta-bar-dismissed";
const EXIT_KEY = "revora:exit-offer-seen";

function readFlag(key: string) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* private mode — the reminder simply returns next load */
  }
}

/** Always-available offer bar, revealed once the visitor starts reading. */
function StickyCtaBar() {
  const { loading, user } = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readFlag(BAR_KEY)) return;
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (loading || user || !show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/35 bg-background/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-snug">
            <span className="gold-hl">
              {GROWTH_SYSTEM.fullAccessWindow} free — full access
            </span>
            <span className="text-muted-foreground"> · no card to start</span>
          </p>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            Then {usd(GROWTH_SYSTEM.setupPrice)} setup, first month free,{" "}
            {usd(GROWTH_SYSTEM.monthlyPrice)}/month. Cancel anytime.
          </p>
        </div>
        <Button asChild variant="signal" size="sm" className="shrink-0">
          <Link to={FREE_ACCESS_TO} search={FREE_ACCESS_SEARCH}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            Start free
          </Link>
        </Button>
        <button
          type="button"
          aria-label="Hide the free access bar"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground"
          onClick={() => {
            writeFlag(BAR_KEY);
            setShow(false);
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** One session-scoped reminder when a visitor is about to leave. */
function ExitIntentOffer() {
  const { loading, user } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readFlag(EXIT_KEY)) return;
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      writeFlag(EXIT_KEY);
      setOpen(true);
    };
    const onLeave = (event: MouseEvent) => {
      if (event.clientY <= 4) fire();
    };
    document.addEventListener("mouseleave", onLeave);
    // Mobile has no exit intent — use sustained engagement without a signup.
    const timer = window.setTimeout(() => {
      if (window.scrollY > 1400) fire();
    }, 55_000);
    return () => {
      document.removeEventListener("mouseleave", onLeave);
      window.clearTimeout(timer);
    };
  }, []);

  if (loading || user || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Free access reminder"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <Panel
        className="gold-glow relative w-full max-w-md border-primary/40 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute top-3 right-3 grid size-8 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground"
          onClick={() => setOpen(false)}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
        <p className="eyebrow">Before you go</p>
        <h2 className="mt-2 font-display text-[20px] leading-tight font-semibold">
          See your own site, leads and bookings{" "}
          <span className="gold-text">free for {GROWTH_SYSTEM.fullAccessWindow}</span>
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Create your account and Revora builds your workspace in about a minute — website builder,
          lead capture, CRM, quotes, booking, follow-up and analytics all unlocked. No card required
          to start, nothing charged until you choose to launch.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild variant="signal" className="h-auto py-3 leading-snug whitespace-normal">
            <Link to={FREE_ACCESS_TO} search={FREE_ACCESS_SEARCH} onClick={() => setOpen(false)}>
              <Sparkles className="size-4" aria-hidden="true" />
              START {GROWTH_SYSTEM.fullAccessWindowUpper} FREE
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <button
            type="button"
            className="cursor-pointer text-[13px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setOpen(false)}
          >
            Keep looking around
          </button>
        </div>
      </Panel>
    </div>
  );
}

/** Mount once per marketing page (already wired into the shared footer). */
export function MarketingConversionKit() {
  return (
    <>
      <StickyCtaBar />
      <ExitIntentOffer />
    </>
  );
}

const STAY_REASONS = [
  {
    icon: Search,
    title: "Your visibility compounds",
    body: "Service and city pages, schema and a health score keep improving month after month — the longer it runs, the more searches you show up for.",
  },
  {
    icon: Repeat,
    title: "Follow-up never stops",
    body: "Automations chase quiet leads, confirm bookings and ask for reviews while you're on the job — every day, without you remembering.",
  },
  {
    icon: LineChart,
    title: "You can see the payback",
    body: "Traffic, leads, quotes, bookings and conversion rate by source, so you know exactly what the system returned this month.",
  },
  {
    icon: ShieldCheck,
    title: "It's yours, and it's safe",
    body: "Your customer list, content and site history stay in your workspace with rollback points before every change. Cancel anytime.",
  },
] as const;

/** "Why businesses stay" — the long-term value proof block. */
export function LongTermValue() {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {STAY_REASONS.map(({ icon: Icon, title, body }) => (
          <Panel key={title} className="card-lift p-5">
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <h3 className="mt-3.5 font-display text-[15px] font-semibold">{title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-5 text-[13px] text-muted-foreground">
        Month one launches the system. Every month after that it gets more pages ranked, more leads
        followed up and more reviews collected —{" "}
        <span className="gold-hl">that's why clients stay</span>.
      </p>
    </div>
  );
}
