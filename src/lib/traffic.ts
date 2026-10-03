/**
 * Website traffic analysis for a client's own site: how many people arrived,
 * where from, what they did — and the problems worth fixing.
 *
 * All of it is derived from real events recorded on the published site. When
 * there isn't enough data, that is said plainly rather than guessed at.
 */

export type TrafficEvent = {
  event_type: string;
  path: string | null;
  source: string | null;
  device: string | null;
  session_id: string | null;
  created_at: string;
};

export const TRAFFIC_RANGES = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

const CONVERSION_EVENTS = new Set([
  "lead",
  "quote_request",
  "booking",
  "call_click",
  "form_submit",
]);

/**
 * Calendar day of a timestamp in the owner's own timezone. `offsetMinutes` is
 * the browser's getTimezoneOffset() (minutes behind UTC). Slicing the UTC ISO
 * string put an evening visit in New York on the next day's bar.
 */
const dayKey = (iso: string, offsetMinutes = 0) =>
  new Date(new Date(iso).getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);

export type TrafficSummary = ReturnType<typeof summarizeTraffic>;

export function summarizeTraffic(events: TrafficEvent[], days: number, offsetMinutes = 0) {
  const now = Date.now();
  const windowStart = now - days * 86_400_000;
  const previousStart = windowStart - days * 86_400_000;

  const inWindow = events.filter((e) => new Date(e.created_at).getTime() >= windowStart);
  const previous = events.filter((e) => {
    const t = new Date(e.created_at).getTime();
    return t >= previousStart && t < windowStart;
  });

  const views = (list: TrafficEvent[]) => list.filter((e) => e.event_type === "page_view");
  const conversions = (list: TrafficEvent[]) =>
    list.filter((e) => CONVERSION_EVENTS.has(e.event_type));
  const visitors = (list: TrafficEvent[]) =>
    new Set(list.map((e) => e.session_id ?? e.created_at)).size;

  const currentViews = views(inWindow);
  const previousViews = views(previous);
  const currentConversions = conversions(inWindow);

  const count = <T extends string>(list: TrafficEvent[], key: (e: TrafficEvent) => T | null) => {
    const map = new Map<string, number>();
    for (const event of list) {
      const value = key(event);
      if (!value) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total }));
  };

  const daily: { day: string; views: number; conversions: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayKey(new Date(now - i * 86_400_000).toISOString(), offsetMinutes);
    daily.push({
      day,
      views: currentViews.filter((e) => dayKey(e.created_at, offsetMinutes) === day).length,
      conversions: currentConversions.filter((e) => dayKey(e.created_at, offsetMinutes) === day).length,
    });
  }

  const viewTotal = currentViews.length;
  const previousTotal = previousViews.length;
  const conversionTotal = currentConversions.length;

  return {
    days,
    views: viewTotal,
    previousViews: previousTotal,
    changePct: previousTotal
      ? Math.round(((viewTotal - previousTotal) / previousTotal) * 100)
      : null,
    visitors: visitors(currentViews),
    conversions: conversionTotal,
    conversionRate: viewTotal ? Math.round((conversionTotal / viewTotal) * 1000) / 10 : 0,
    calls: inWindow.filter((e) => e.event_type === "call_click").length,
    sources: count(inWindow, (e) => e.source ?? "direct").slice(0, 8),
    pages: count(currentViews, (e) => e.path ?? "/").slice(0, 10),
    devices: count(currentViews, (e) => e.device ?? "unknown"),
    daily,
    busiestDay: daily.reduce(
      (best, day) => (day.views > best.views ? day : best),
      daily[0] ?? { day: "", views: 0, conversions: 0 },
    ),
    hasEnoughData: viewTotal >= 20,
  };
}

export type TrafficIssue = {
  key: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  fix: string;
  /** Where in the app the client goes to fix it. */
  href:
    | "/app/launch"
    | "/app/analytics"
    | "/app/domain"
    | "/app/website"
    | "/app/quotes"
    | "/app/services";
};

/** Problems worth telling a business owner about, with the place to fix each. */
export function detectTrafficIssues(input: {
  summary: TrafficSummary;
  published: boolean;
  hasQuoteForm: boolean;
  bookableServices: number;
  reviewCount: number;
  domainLive: boolean;
  hasCustomDomain: boolean;
  leadsInWindow: number;
}): TrafficIssue[] {
  const issues: TrafficIssue[] = [];
  const s = input.summary;

  if (!input.published)
    issues.push({
      key: "not_published",
      severity: "critical",
      title: "Your website isn't published",
      detail: "Nobody can find the site, so no traffic is being recorded at all.",
      fix: "Run the launch checks and publish.",
      href: "/app/launch",
    });

  if (input.published && s.views === 0)
    issues.push({
      key: "no_traffic",
      severity: "critical",
      title: `No visits in the last ${s.days} ${s.days === 1 ? "day" : "days"}`,
      detail: "The site is live but nobody has landed on it.",
      fix: "Share your link on your Google profile and social pages, and print the QR code for jobs.",
      href: "/app/analytics",
    });

  if (s.changePct !== null && s.changePct <= -40 && s.previousViews >= 20)
    issues.push({
      key: "traffic_drop",
      severity: "critical",
      title: `Visits dropped ${Math.abs(s.changePct)}%`,
      detail: `${s.views} visits this period against ${s.previousViews} in the period before.`,
      fix: "Check your domain and search visibility, then re-run the launch checks.",
      href: "/app/domain",
    });

  if (s.views >= 30 && s.conversions === 0)
    issues.push({
      key: "no_conversions",
      severity: "critical",
      title: "Visitors are arriving but nobody is enquiring",
      detail: `${s.views} visits and no calls, quotes or bookings.`,
      fix: "Put the quote form and a call button in the first screen, and shorten the form.",
      href: "/app/website",
    });
  else if (s.views >= 50 && s.conversionRate < 2)
    issues.push({
      key: "low_conversion",
      severity: "warning",
      title: `Only ${s.conversionRate}% of visitors enquire`,
      detail: "A local service site should usually convert 3-8% of visits.",
      fix: "Move your strongest offer higher and cut optional form fields.",
      href: "/app/website",
    });

  if (!input.hasQuoteForm)
    issues.push({
      key: "no_quote",
      severity: "warning",
      title: "No instant quote on the site",
      detail: "Visitors who won't call have nothing to fill in.",
      fix: "Set up the quote calculator so pricing questions capture a lead.",
      href: "/app/quotes",
    });

  if (input.bookableServices === 0)
    issues.push({
      key: "no_booking",
      severity: "warning",
      title: "Nothing can be booked online",
      detail: "Ready-to-buy visitors have to wait for you to call back.",
      fix: "Mark at least one service as bookable.",
      href: "/app/services",
    });

  if (input.reviewCount < 3)
    issues.push({
      key: "thin_proof",
      severity: "warning",
      title: "Not enough published reviews",
      detail: "Proof next to the button is the cheapest lift in enquiries you can get.",
      fix: "Request reviews from recent customers and publish them.",
      href: "/app/website",
    });

  if (input.hasCustomDomain && !input.domainLive)
    issues.push({
      key: "domain_not_live",
      severity: "critical",
      title: "Your custom domain isn't serving the site yet",
      detail: "DNS or the certificate hasn't finished, so people using that address see nothing.",
      fix: "Open the Domain Center and follow the remaining steps.",
      href: "/app/domain",
    });

  const mobileShare = (() => {
    const total = s.devices.reduce((sum, d) => sum + d.total, 0);
    const mobile = s.devices.find((d) => d.name === "mobile")?.total ?? 0;
    return total ? mobile / total : 0;
  })();
  if (s.views >= 50 && mobileShare >= 0.6 && s.calls === 0)
    issues.push({
      key: "mobile_no_calls",
      severity: "warning",
      title: "Mostly phone visitors, but no call taps",
      detail: `${Math.round(mobileShare * 100)}% of visits are on a phone and nobody tapped to call.`,
      fix: "Keep the sticky call bar on and make sure your number is correct.",
      href: "/app/website",
    });

  if (input.leadsInWindow > 0 && s.views === 0)
    issues.push({
      key: "tracking_gap",
      severity: "info",
      title: "Leads recorded without matching visits",
      detail:
        "Enquiries came in but page views weren't tracked — usually an ad blocker or an old published version.",
      fix: "Re-publish the site so tracking is up to date.",
      href: "/app/launch",
    });

  return issues;
}

export const severityTone = (severity: TrafficIssue["severity"]) =>
  severity === "critical" ? "danger" : severity === "warning" ? "attention" : "info";
