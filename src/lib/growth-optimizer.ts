/**
 * Post-launch conversion optimiser — browser-safe and evidence-based.
 *
 * Every recommendation is derived from events the published site actually
 * recorded (page views, quote starts, form submits, call taps, bookings). When
 * there isn't enough data to be sure, the optimiser says so instead of guessing.
 */

export type OptimizerEvent = {
  event_type: string;
  path: string | null;
  device: string | null;
  created_at: string;
};

export type OptimizerInput = {
  events: OptimizerEvent[];
  /** Leads created in the same window. */
  leads: number;
  bookings: number;
  /** Current configuration the advice refers to. */
  primaryCtaLabel: string | null;
  quoteFormQuestions: number;
  bookableServices: number;
  /** Whether a quote/booking section sits on the first screen. */
  captureAboveFold: boolean;
};

export type PageInsight = {
  path: string;
  views: number;
  /** Quote starts, booking starts, form submits and call taps on that page. */
  actions: number;
  rate: number;
  verdict: "strong" | "average" | "weak" | "insufficient";
};

export type OptimizerAction = {
  key: string;
  title: string;
  /** The evidence, stated plainly with real numbers. */
  evidence: string;
  action: string;
  to?: string;
  impact: "high" | "medium" | "low";
};

const ACTION_EVENTS = new Set([
  "quote_start",
  "quote_complete",
  "booking_start",
  "form_submit",
  "call_click",
  "text_click",
  "email_click",
]);

/** Minimum views before a page's conversion rate means anything. */
export const MIN_VIEWS = 30;

export function pageInsights(events: OptimizerEvent[]): PageInsight[] {
  const rows = new Map<string, { views: number; actions: number }>();
  for (const event of events) {
    const path = (event.path ?? "/").split("?")[0] || "/";
    const row = rows.get(path) ?? { views: 0, actions: 0 };
    if (event.event_type === "page_view") row.views += 1;
    else if (ACTION_EVENTS.has(event.event_type)) row.actions += 1;
    rows.set(path, row);
  }

  return [...rows.entries()]
    .map(([path, row]) => {
      const rate = row.views ? row.actions / row.views : 0;
      const verdict: PageInsight["verdict"] =
        row.views < MIN_VIEWS
          ? "insufficient"
          : rate >= 0.06
            ? "strong"
            : rate >= 0.02
              ? "average"
              : "weak";
      return { path, views: row.views, actions: row.actions, rate, verdict };
    })
    .sort((a, b) => b.views - a.views);
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * Turns real performance into specific changes to the CTA, the form fields and
 * where the quote/booking block sits.
 */
export function optimizerActions(input: OptimizerInput): {
  pages: PageInsight[];
  actions: OptimizerAction[];
} {
  const pages = pageInsights(input.events);
  const actions: OptimizerAction[] = [];
  const count = (type: string) => input.events.filter((e) => e.event_type === type).length;

  const views = count("page_view");
  const quoteStarts = count("quote_start");
  const quoteCompletes = count("quote_complete");
  const bookingStarts = count("booking_start");
  const submits = count("form_submit");
  const calls = count("call_click");
  const mobileViews = input.events.filter(
    (e) => e.event_type === "page_view" && e.device === "mobile",
  ).length;

  if (views < MIN_VIEWS) {
    return {
      pages,
      actions: [
        {
          key: "need-data",
          title: "Not enough visits to optimise yet",
          evidence: `${views} page view${views === 1 ? "" : "s"} recorded — Revora waits for ${MIN_VIEWS} before changing anything.`,
          action:
            "Share your website link, QR code and Google Business Profile to bring in visits.",
          to: "/app/launch",
          impact: "medium",
        },
      ],
    };
  }

  // Weak pages: real views, almost no action taken.
  for (const page of pages.filter((p) => p.verdict === "weak").slice(0, 3)) {
    actions.push({
      key: `weak-${page.path}`,
      title: `${page.path} isn't converting`,
      evidence: `${page.views} views and ${page.actions} action${page.actions === 1 ? "" : "s"} (${pct(page.rate)}).`,
      action: input.captureAboveFold
        ? `Restate “${input.primaryCtaLabel ?? "your main button"}” halfway down this page and again at the end.`
        : "Move the quote or booking block onto the first screen of this page.",
      to: "/app/website",
      impact: "high",
    });
  }

  // Quote calculator abandonment: started but not finished.
  if (quoteStarts >= 10 && quoteCompletes / quoteStarts < 0.5) {
    actions.push({
      key: "quote-abandon",
      title: "Visitors abandon the quote calculator",
      evidence: `${quoteStarts} started, ${quoteCompletes} finished (${pct(quoteCompletes / Math.max(quoteStarts, 1))}).`,
      action:
        input.quoteFormQuestions > 4
          ? `Cut the calculator from ${input.quoteFormQuestions} questions to three or four and ask the rest after they enquire.`
          : "Show the estimated range earlier so the last step feels worth finishing.",
      to: "/app/quotes",
      impact: "high",
    });
  }

  // Interest without a form: the CTA points the wrong way.
  if (calls >= 5 && submits + quoteCompletes === 0) {
    actions.push({
      key: "prefer-calls",
      title: "Your customers want to call, not fill a form",
      evidence: `${calls} call tap${calls === 1 ? "" : "s"} and no completed forms.`,
      action: "Make the phone number the main button and keep the form as the backup.",
      to: "/app/website",
      impact: "high",
    });
  }

  // Booking exists but nobody reaches it.
  if (input.bookableServices > 0 && bookingStarts === 0 && views >= 100) {
    actions.push({
      key: "booking-hidden",
      title: "Nobody is reaching your booking step",
      evidence: `${views} views, ${input.bookableServices} bookable service${input.bookableServices === 1 ? "" : "s"} and 0 booking starts.`,
      action: "Ask Revora to make the booking path visible in the hero and service cards.",
      to: "/app/website",
      impact: "high",
    });
  }

  // Mobile-dominant traffic with a long form.
  if (mobileViews / Math.max(views, 1) > 0.6 && input.quoteFormQuestions > 5) {
    actions.push({
      key: "mobile-form",
      title: "Your form is long for a mobile audience",
      evidence: `${pct(mobileViews / views)} of visits are on a phone and your form asks ${input.quoteFormQuestions} questions.`,
      action:
        "Keep four fields on mobile — service, location, timing and phone — and ask the rest by reply.",
      to: "/app/quotes",
      impact: "medium",
    });
  }

  // Overall conversion floor.
  const leadRate = input.leads / views;
  if (leadRate < 0.02 && !actions.some((a) => a.impact === "high")) {
    actions.push({
      key: "low-overall",
      title: "Overall conversion is below 2%",
      evidence: `${input.leads} enquir${input.leads === 1 ? "y" : "ies"} and ${input.bookings} booking${input.bookings === 1 ? "" : "s"} from ${views} visits (${pct(leadRate)}).`,
      action: "Lead with a price guide and repeat the main button after every second section.",
      to: "/app/website",
      impact: "high",
    });
  }

  if (!actions.length) {
    const best = pages.find((p) => p.verdict === "strong");
    actions.push({
      key: "healthy",
      title: "Your site is converting well",
      evidence: best
        ? `${best.path} converts at ${pct(best.rate)} across ${best.views} views.`
        : `${input.leads} enquiries from ${views} visits (${pct(leadRate)}).`,
      action: "Keep the current layout and spend the effort on getting more visits.",
      to: "/app/analytics",
      impact: "low",
    });
  }

  return { pages, actions: actions.slice(0, 6) };
}
