/**
 * Customer health score (Retention Autopilot).
 *
 * A 0–100 score per client workspace, built only from records Revora already
 * keeps: whether the site is live and loading, real leads, search readiness,
 * onboarding, whether anyone in the workspace is working leads, and billing
 * state. A signal Revora cannot read for a workspace is left out and the
 * remaining weights are rescaled — it is never guessed. Support tickets are
 * not tracked in the database yet, so that weight is always left out.
 *
 * Weights follow the retention plan: website 20, leads 25, search 15,
 * onboarding 10, engagement 10, support 10, billing 10.
 */

export const HEALTH_WEIGHTS = {
  website: 20,
  leads: 25,
  search: 15,
  onboarding: 10,
  engagement: 10,
  support: 10,
  billing: 10,
} as const;

export type HealthPart = keyof typeof HEALTH_WEIGHTS;

/** Below this a retention case is opened; below the critical line a person takes over. */
export const HEALTH_AT_RISK = 60;
export const HEALTH_CRITICAL = 35;
/** A workspace needs this long live before "no leads" means anything. */
export const LEAD_WINDOW_DAYS = 14;
/** Leads still "new" this long after arriving are escalated past the owner's own 24h reminder. */
export const UNANSWERED_HOURS = 72;

const DAY = 86_400_000;

export type HealthInput = {
  now: number;
  /** When the workspace was created. */
  createdAt: string | null;
  onboardingCompleted: boolean | null;
  onboardingStep?: string | null;
  site: {
    published: boolean | null;
    /** First publish Revora recorded (earliest publish event, else the last publish). */
    liveSince: string | null;
    customDomain: string | null;
    domainVerified: boolean | null;
    dnsOk: boolean | null;
    sslOk: boolean | null;
    revoraHostOk: boolean | null;
  } | null;
  /** Created-at timestamps of the workspace's leads over the last 70 days. */
  leadDates: readonly string[];
  /** Leads still marked new, with when they arrived. */
  newLeadDates: readonly string[];
  /** Staff-logged lead activity timestamps (calls, notes, status changes) over the last 14 days. */
  staffActivityDates: readonly string[];
  profile: { phone: string | null; city: string | null; serviceArea: string | null; address: string | null } | null;
  billing: { status: string | null; cancelAtPeriodEnd: boolean | null } | null;
};

export type HealthPartResult = { part: HealthPart; points: number; max: number; note: string };

export type HealthBand = "healthy" | "at_risk" | "critical";

export type HealthResult = {
  /** 0–100, rescaled over the parts that could be read. Null when nothing could be read. */
  score: number | null;
  band: HealthBand | null;
  parts: HealthPartResult[];
  /** Parts left out because Revora has no record for them. */
  unknown: HealthPart[];
  /** Plain reasons for lost points, worst first. */
  reasons: string[];
  /** Days since the first publish Revora recorded, if known. */
  liveDays: number | null;
  leadsLast14: number;
  unansweredLeads: number;
};

const ms = (value: string | null | undefined) => {
  const t = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(t) ? t : null;
};

export function bandFor(score: number): HealthBand {
  if (score < HEALTH_CRITICAL) return "critical";
  if (score < HEALTH_AT_RISK) return "at_risk";
  return "healthy";
}

export function scoreCustomerHealth(input: HealthInput): HealthResult {
  const parts: HealthPartResult[] = [];
  const unknown: HealthPart[] = ["support"];
  const { now } = input;
  const published = ms(input.site?.liveSince);
  const liveDays = input.site?.published && published !== null ? Math.max(0, Math.floor((now - published) / DAY)) : null;
  const createdDays = ms(input.createdAt) === null ? null : Math.floor((now - ms(input.createdAt)!) / DAY);

  // Website: live and loading.
  const site = input.site;
  if (!site) unknown.push("website");
  else if (!site.published) {
    parts.push({ part: "website", points: 0, max: HEALTH_WEIGHTS.website, note: "The website is not published yet." });
  } else if (site.customDomain) {
    const failing = [site.dnsOk === false && "DNS", site.sslOk === false && "SSL", site.domainVerified === false && "domain verification"].filter(Boolean);
    parts.push(
      failing.length
        ? { part: "website", points: 5, max: HEALTH_WEIGHTS.website, note: `Custom domain ${site.customDomain} is failing ${failing.join(", ")}.` }
        : { part: "website", points: HEALTH_WEIGHTS.website, max: HEALTH_WEIGHTS.website, note: "Live on its custom domain." },
    );
  } else if (site.revoraHostOk === false) {
    parts.push({ part: "website", points: 5, max: HEALTH_WEIGHTS.website, note: "The Revora-hosted address failed its last check." });
  } else {
    parts.push({ part: "website", points: HEALTH_WEIGHTS.website, max: HEALTH_WEIGHTS.website, note: "Live on its Revora address." });
  }

  // Leads: last 14 days against the workspace's own earlier pace.
  const leadTimes = input.leadDates.map(ms).filter((t): t is number => t !== null);
  const last14 = leadTimes.filter((t) => t >= now - LEAD_WINDOW_DAYS * DAY).length;
  const prior = leadTimes.filter((t) => t < now - LEAD_WINDOW_DAYS * DAY && t >= now - 70 * DAY).length;
  if (liveDays === null || liveDays < LEAD_WINDOW_DAYS) unknown.push("leads");
  else {
    // Baseline per 14 days over the up-to-56 days before the window that the site was live.
    const priorDays = Math.min(56, liveDays - LEAD_WINDOW_DAYS);
    const baseline = priorDays >= LEAD_WINDOW_DAYS ? (prior / priorDays) * LEAD_WINDOW_DAYS : null;
    if (last14 === 0) parts.push({ part: "leads", points: 0, max: HEALTH_WEIGHTS.leads, note: "No leads in the last 14 days." });
    else if (baseline !== null && baseline >= 2 && last14 < baseline * 0.5)
      parts.push({ part: "leads", points: 12, max: HEALTH_WEIGHTS.leads, note: `${last14} leads in 14 days, under half the earlier pace (${Math.round(baseline)}).` });
    else parts.push({ part: "leads", points: HEALTH_WEIGHTS.leads, max: HEALTH_WEIGHTS.leads, note: `${last14} lead${last14 === 1 ? "" : "s"} in the last 14 days.` });
  }

  // Search readiness: facts Google needs for a local listing, and an address it can index.
  if (!site?.published || !input.profile) unknown.push("search");
  else {
    const missing: string[] = [];
    if (!input.profile.phone?.trim()) missing.push("phone");
    if (!(input.profile.city?.trim() || input.profile.serviceArea?.trim() || input.profile.address?.trim())) missing.push("city or service area");
    let points: number = HEALTH_WEIGHTS.search;
    if (missing.length) points -= 8;
    if (site.customDomain && site.domainVerified === false) points -= 7;
    points = Math.max(0, points);
    const notes = [missing.length ? `Business details missing for local search: ${missing.join(", ")}.` : null, site.customDomain && site.domainVerified === false ? "Custom domain not verified, so it cannot be indexed." : null].filter(Boolean);
    parts.push({ part: "search", points, max: HEALTH_WEIGHTS.search, note: notes.join(" ") || "Local business details complete." });
  }

  // Onboarding.
  if (input.onboardingCompleted === null) unknown.push("onboarding");
  else
    parts.push(
      input.onboardingCompleted
        ? { part: "onboarding", points: HEALTH_WEIGHTS.onboarding, max: HEALTH_WEIGHTS.onboarding, note: "Onboarding complete." }
        : {
            part: "onboarding",
            points: createdDays !== null && createdDays < 3 ? 5 : 0,
            max: HEALTH_WEIGHTS.onboarding,
            note: `Onboarding not finished${input.onboardingStep ? ` (stopped at "${input.onboardingStep}")` : ""}.`,
          },
    );

  // Engagement: is anyone working the leads that arrive?
  const recentActivity = input.staffActivityDates.map(ms).filter((t): t is number => t !== null && t >= now - LEAD_WINDOW_DAYS * DAY).length;
  if (last14 === 0 && recentActivity === 0) unknown.push("engagement");
  else
    parts.push(
      recentActivity > 0
        ? { part: "engagement", points: HEALTH_WEIGHTS.engagement, max: HEALTH_WEIGHTS.engagement, note: "The team logged lead work in the last 14 days." }
        : { part: "engagement", points: 0, max: HEALTH_WEIGHTS.engagement, note: "Leads arrived but nobody logged a call, note or status change in 14 days." },
    );

  // Billing.
  const status = input.billing?.status?.toLowerCase() ?? null;
  if (!status) unknown.push("billing");
  else if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(status))
    parts.push({ part: "billing", points: 0, max: HEALTH_WEIGHTS.billing, note: `Subscription is ${status.replace(/_/g, " ")}.` });
  else if (status === "canceled" || status === "cancelled")
    parts.push({ part: "billing", points: 0, max: HEALTH_WEIGHTS.billing, note: "Subscription is cancelled." });
  else if (input.billing?.cancelAtPeriodEnd)
    parts.push({ part: "billing", points: 3, max: HEALTH_WEIGHTS.billing, note: "Subscription is set to cancel at the end of the period." });
  else parts.push({ part: "billing", points: HEALTH_WEIGHTS.billing, max: HEALTH_WEIGHTS.billing, note: `Subscription ${status}.` });

  const unanswered = input.newLeadDates.map(ms).filter((t): t is number => t !== null && now - t >= UNANSWERED_HOURS * 3_600_000 && now - t <= 14 * DAY).length;

  const max = parts.reduce((sum, p) => sum + p.max, 0);
  const got = parts.reduce((sum, p) => sum + p.points, 0);
  const score = max > 0 ? Math.round((got / max) * 100) : null;
  const reasons = parts
    .filter((p) => p.points < p.max)
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .map((p) => p.note);
  if (unanswered > 0) reasons.push(`${unanswered} lead${unanswered === 1 ? " has" : "s have"} been waiting ${UNANSWERED_HOURS}h+ with no reply.`);
  return { score, band: score === null ? null : bandFor(score), parts, unknown: [...new Set(unknown)], reasons, liveDays, leadsLast14: last14, unansweredLeads: unanswered };
}
