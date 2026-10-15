/**
 * Deterministic guardrails for Jarvis customer-acquisition workflows.
 * This module never sends messages, spends money, scrapes prospects, or publishes.
 * It scores supplied lead metadata and decides whether a pre-approved follow-up
 * may be queued. Provider execution remains a separate server-side integration.
 */
/** Canonical offer values used by acquisition copy; change only with owner authorization. */
export const REVORA_OFFER = {
  setupFeeUsd: 750,
  firstMonthFree: true,
  monthlyPriceUsd: 100,
  trialDays: 1,
} as const;

export function formatRevoraOffer(): string {
  return "$" + REVORA_OFFER.setupFeeUsd + " one-time setup, first month free, then $" + REVORA_OFFER.monthlyPriceUsd + "/month, with a " + REVORA_OFFER.trialDays + "-day full-access trial";
}

export type LeadSignal = {
  hasBusinessName?: boolean;
  hasValidContactRoute?: boolean;
  requestedQuote?: boolean;
  requestedDemo?: boolean;
  hasWebsite?: boolean;
  websiteHasIssues?: boolean;
  serviceAreaMatch?: boolean;
  budgetFit?: boolean;
  recentIntentDays?: number | null;
  consent?: "explicit" | "transactional_only" | "unknown" | "withdrawn";
  optedOut?: boolean;
  bounced?: boolean;
  complained?: boolean;
  customerAlreadyActive?: boolean;
};

export type LeadScore = {
  score: number;
  tier: "hot" | "warm" | "early";
  reasons: string[];
  recommendedNextStep: "human_review" | "prepare_personalized_audit" | "offer_booking" | "nurture_eligible" | "suppress";
};

export type AcquisitionChannel = "email" | "sms" | "whatsapp" | "in_app";

export type FollowupContext = {
  channel: AcquisitionChannel;
  consent: LeadSignal["consent"];
  optedOut: boolean;
  bounced: boolean;
  complained: boolean;
  approvedTemplate: boolean;
  verifiedProvider: boolean;
  tenantScopeVerified: boolean;
  withinQuietHours: boolean;
  sentInRolling24h: number;
  maxPerRolling24h: number;
  duplicateIdempotencyKey: boolean;
  includesUnverifiedClaims: boolean;
  includesSensitiveData: boolean;
  isBulkColdOutreach: boolean;
};

export type FollowupDecision =
  | { allowed: true; mode: "queue_for_delivery"; reason: string }
  | { allowed: false; mode: "blocked"; reason: string };

export function scoreAcquisitionLead(input: LeadSignal): LeadScore {
  if (input.optedOut || input.bounced || input.complained || input.consent === "withdrawn" || input.customerAlreadyActive) {
    return {
      score: 0,
      tier: "early",
      reasons: ["Suppressed: opt-out, delivery/complaint signal, or existing customer state requires exclusion from prospect nurture."],
      recommendedNextStep: "suppress",
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };

  if (input.requestedQuote) add(30, "Explicit quote request");
  if (input.requestedDemo) add(25, "Explicit demo or consultation request");
  if (input.hasValidContactRoute) add(10, "A contact route is present");
  if (input.hasBusinessName) add(5, "Business identity is present");
  if (input.serviceAreaMatch) add(10, "Service area appears to match");
  if (input.budgetFit) add(10, "Budget fit has been confirmed");
  if (input.hasWebsite && input.websiteHasIssues) add(10, "Website issues may support a relevant audit");
  if (typeof input.recentIntentDays === "number" && Number.isFinite(input.recentIntentDays) && input.recentIntentDays >= 0) {
    if (input.recentIntentDays <= 1) add(15, "Intent recorded within 24 hours");
    else if (input.recentIntentDays <= 7) add(10, "Intent recorded within 7 days");
    else if (input.recentIntentDays <= 30) add(4, "Intent recorded within 30 days");
  }

  score = Math.max(0, Math.min(100, score));
  const tier = score >= 65 ? "hot" : score >= 35 ? "warm" : "early";
  let recommendedNextStep: LeadScore["recommendedNextStep"] = "human_review";
  if (input.requestedQuote || input.requestedDemo) recommendedNextStep = "offer_booking";
  else if (input.hasWebsite && input.websiteHasIssues) recommendedNextStep = "prepare_personalized_audit";
  else if (input.consent === "explicit") recommendedNextStep = "nurture_eligible";

  if (input.consent !== "explicit" && recommendedNextStep === "nurture_eligible") {
    recommendedNextStep = "human_review";
    reasons.push("Marketing consent is not explicit; no nurture message may be queued.");
  }
  return { score, tier, reasons, recommendedNextStep };
}

/**
 * Outbound delivery is deliberately fail-closed. Even an eligible follow-up
 * requires an explicit opt-in, approved copy, a verified provider and tenant
 * scope, and an idempotent bounded delivery queue.
 */
export function authorizeAcquisitionFollowup(context: FollowupContext): FollowupDecision {
  const deny = (reason: string): FollowupDecision => ({ allowed: false, mode: "blocked", reason });
  if (context.optedOut || context.consent === "withdrawn") return deny("Recipient has opted out or withdrawn consent.");
  if (context.bounced || context.complained) return deny("Delivery failure or complaint suppresses outbound follow-up.");
  if (context.consent !== "explicit") return deny("Explicit channel-appropriate consent is required.");
  if (context.isBulkColdOutreach) return deny("Bulk cold outreach is not permitted by the acquisition autopilot.");
  if (!context.approvedTemplate) return deny("Use an approved, versioned message template.");
  if (!context.verifiedProvider) return deny("The sending provider must be connected and runtime-verified.");
  if (!context.tenantScopeVerified) return deny("Tenant ownership and sender identity must be verified.");
  if (!context.withinQuietHours) return deny("The recipient's permitted sending window is closed.");
  if (context.includesUnverifiedClaims) return deny("Unverified business, pricing, performance, or testimonial claims are prohibited.");
  if (context.includesSensitiveData) return deny("Sensitive or unnecessary personal data must not be included.");
  if (context.duplicateIdempotencyKey) return deny("Duplicate delivery key detected.");
  if (!Number.isInteger(context.sentInRolling24h) || context.sentInRolling24h < 0 ||
      !Number.isInteger(context.maxPerRolling24h) || context.maxPerRolling24h < 1 ||
      context.sentInRolling24h >= context.maxPerRolling24h) return deny("Rolling 24-hour send budget is exhausted or invalid.");
  if (context.channel === "in_app") {
    return { allowed: true, mode: "queue_for_delivery", reason: "Consent, approval, scope, timing, idempotency, and budget checks passed." };
  }
  return { allowed: true, mode: "queue_for_delivery", reason: "Consent, approved copy, verified provider, tenant scope, timing, idempotency, and budget checks passed." };
}

export type AcquisitionGoal = "more_qualified_leads" | "more_booked_calls" | "more_paid_customers" | "improve_conversion";

export type AcquisitionPlanInput = {
  goal: AcquisitionGoal;
  dailyBudgetCents: number;
  approvedDailyBudgetCents: number;
  funnelHasVerifiedAnalytics: boolean;
  websiteAuditAvailable: boolean;
  leadCaptureAvailable: boolean;
  calendarAvailable: boolean;
  paymentFlowVerified: boolean;
  outboundProviderVerified: boolean;
};

export type AcquisitionPlan = {
  status: "ready_for_review" | "blocked";
  goal: AcquisitionGoal;
  steps: Array<{ id: string; title: string; mode: "autonomous_read_only" | "prepare_for_approval" | "blocked"; reason: string }>;
  budgetCents: number;
  note: string;
};

export function buildAcquisitionPlan(input: AcquisitionPlanInput): AcquisitionPlan {
  const budgetValid = Number.isInteger(input.dailyBudgetCents) && input.dailyBudgetCents >= 0 &&
    Number.isInteger(input.approvedDailyBudgetCents) && input.approvedDailyBudgetCents >= 0 &&
    input.dailyBudgetCents <= input.approvedDailyBudgetCents;
  const steps: AcquisitionPlan["steps"] = [
    { id: "measure", title: "Measure funnel", mode: input.funnelHasVerifiedAnalytics ? "autonomous_read_only" : "prepare_for_approval", reason: input.funnelHasVerifiedAnalytics ? "Use verified, aggregate funnel events only." : "Analytics evidence is missing; validate instrumentation before claiming conversion performance." },
    { id: "site_audit", title: "Find conversion blockers", mode: input.websiteAuditAvailable ? "autonomous_read_only" : "blocked", reason: input.websiteAuditAvailable ? "Run bounded read-only site, mobile, accessibility, and SEO checks." : "Website audit capability is unavailable." },
    { id: "lead_capture", title: "Check lead capture", mode: input.leadCaptureAvailable ? "autonomous_read_only" : "prepare_for_approval", reason: input.leadCaptureAvailable ? "Verify forms and report aggregate delivery outcomes." : "Lead capture is not verified; do not promise lead delivery." },
    { id: "offer", title: "Prepare conversion improvements", mode: "prepare_for_approval", reason: "Draft landing-page, offer, and copy improvements for owner review; never invent proof or guaranteed outcomes." },
    { id: "followup", title: "Follow up with eligible leads", mode: input.outboundProviderVerified ? "prepare_for_approval" : "blocked", reason: input.outboundProviderVerified ? "Only explicit opt-ins, approved templates, verified tenant scope, quiet hours, idempotency, and send budgets qualify." : "No verified outbound provider; prepare recommendations only." },
    { id: "booking", title: "Reduce booking friction", mode: input.calendarAvailable ? "prepare_for_approval" : "blocked", reason: input.calendarAvailable ? "Propose a booking CTA using verified availability; do not create appointments without authorization." : "Calendar capability is not verified." },
    { id: "checkout", title: "Verify paid conversion path", mode: input.paymentFlowVerified ? "autonomous_read_only" : "prepare_for_approval", reason: input.paymentFlowVerified ? "Run a read-only entitlement and checkout contract check; never create a charge." : "Payment flow needs a sandbox/test verification before being treated as healthy." },
  ];
  if (!budgetValid) {
    return { status: "blocked", goal: input.goal, steps: steps.map(step => ({ ...step, mode: "blocked", reason: "Daily budget must be a non-negative integer no greater than the owner-approved budget." })), budgetCents: 0, note: "No spend or paid provider call is authorized." };
  }
  return {
    status: steps.some(step => step.mode === "blocked") ? "blocked" : "ready_for_review",
    goal: input.goal,
    steps,
    budgetCents: input.dailyBudgetCents,
    note: "This planner prepares a measurable acquisition run. It does not send messages, spend money, publish changes, or guarantee customer/revenue outcomes.",
  };
}
