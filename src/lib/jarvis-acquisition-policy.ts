/**
 * Deterministic guardrails for Jarvis customer-acquisition workflows.
 * This module never sends messages, spends money, scrapes prospects, or publishes.
 * It scores supplied lead metadata and decides whether a pre-approved follow-up
 * may be queued. Provider execution remains a separate server-side integration.
 */
import { GROWTH_SYSTEM } from "./offer";

/** Derived from the single canonical offer module; never hard-code commercial terms here. */
export const REVORA_OFFER = {
  setupFeeUsd: GROWTH_SYSTEM.setupPrice,
  firstMonthFree: true,
  monthlyPriceUsd: GROWTH_SYSTEM.monthlyPrice,
  trialDays: GROWTH_SYSTEM.fullAccessTrialDays,
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
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      score: 0,
      tier: "early",
      reasons: ["Malformed lead data; keep the record in human review."],
      recommendedNextStep: "human_review",
    };
  }

  const booleanKeys = [
    "hasBusinessName", "hasValidContactRoute", "requestedQuote", "requestedDemo",
    "hasWebsite", "websiteHasIssues", "serviceAreaMatch", "budgetFit",
    "optedOut", "bounced", "complained", "customerAlreadyActive",
  ] as const;
  const malformedFlags = booleanKeys.filter((key) => {
    const value = (input as unknown as Record<string, unknown>)[key];
    return value !== undefined && typeof value !== "boolean";
  });
  if (malformedFlags.length) {
    return {
      score: 0,
      tier: "early",
      reasons: ["Malformed boolean signals kept out of automated scoring: " + malformedFlags.join(", ") + "."],
      recommendedNextStep: "human_review",
    };
  }

  if (input.optedOut === true || input.bounced === true || input.complained === true ||
      input.consent === "withdrawn" || input.customerAlreadyActive === true) {
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

  if (input.requestedQuote === true) add(30, "Explicit quote request");
  if (input.requestedDemo === true) add(25, "Explicit demo or consultation request");
  if (input.hasValidContactRoute === true) add(10, "A contact route is present");
  if (input.hasBusinessName === true) add(5, "Business identity is present");
  if (input.serviceAreaMatch === true) add(10, "Service area appears to match");
  if (input.budgetFit === true) add(10, "Budget fit has been confirmed");
  if (input.hasWebsite === true && input.websiteHasIssues === true) add(10, "Website issues may support a relevant audit");
  if (typeof input.recentIntentDays === "number" && Number.isFinite(input.recentIntentDays) && input.recentIntentDays >= 0) {
    if (input.recentIntentDays <= 1) add(15, "Intent recorded within 24 hours");
    else if (input.recentIntentDays <= 7) add(10, "Intent recorded within 7 days");
    else if (input.recentIntentDays <= 30) add(4, "Intent recorded within 30 days");
  }

  score = Math.max(0, Math.min(100, score));
  const tier = score >= 65 ? "hot" : score >= 35 ? "warm" : "early";
  let recommendedNextStep: LeadScore["recommendedNextStep"] = "human_review";
  if (input.requestedQuote === true || input.requestedDemo === true) recommendedNextStep = "offer_booking";
  else if (input.hasWebsite === true && input.websiteHasIssues === true) recommendedNextStep = "prepare_personalized_audit";
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
 * scope, and an idempotent bounded delivery queue. Authorization flags must be
 * actual booleans; truthy strings or missing values never grant permission.
 */
export function authorizeAcquisitionFollowup(context: FollowupContext): FollowupDecision {
  const deny = (reason: string): FollowupDecision => ({ allowed: false, mode: "blocked", reason });
  if (!context || typeof context !== "object") return deny("Follow-up context is invalid.");
  if (context.optedOut !== false || context.consent === "withdrawn") return deny("Recipient has opted out, withdrawn consent, or opt-out status is not verified.");
  if (context.bounced !== false || context.complained !== false) return deny("Delivery failure or complaint suppresses outbound follow-up, or suppression status is not verified.");
  if (context.consent !== "explicit") return deny("Explicit channel-appropriate consent is required.");
  if (!["email", "sms", "whatsapp", "in_app"].includes(context.channel)) return deny("The delivery channel is not recognized.");
  if (context.isBulkColdOutreach !== false) return deny("Bulk cold outreach is not permitted by the acquisition autopilot.");
  if (context.approvedTemplate !== true) return deny("Use an approved, versioned message template.");
  if (context.verifiedProvider !== true) return deny("The sending provider must be connected and runtime-verified.");
  if (context.tenantScopeVerified !== true) return deny("Tenant ownership and sender identity must be verified.");
  if (context.withinQuietHours !== true) return deny("The recipient's permitted sending window is closed or unverified.");
  if (context.includesUnverifiedClaims !== false) return deny("Unverified business, pricing, performance, or testimonial claims are prohibited.");
  if (context.includesSensitiveData !== false) return deny("Sensitive or unnecessary personal data must not be included.");
  if (context.duplicateIdempotencyKey !== false) return deny("Duplicate or unverified delivery key detected.");
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
  const fallbackGoal: AcquisitionGoal = "improve_conversion";
  const validGoals: readonly string[] = ["more_qualified_leads", "more_booked_calls", "more_paid_customers", "improve_conversion"];
  const booleanKeys = [
    "funnelHasVerifiedAnalytics", "websiteAuditAvailable", "leadCaptureAvailable",
    "calendarAvailable", "paymentFlowVerified", "outboundProviderVerified",
  ] as const;
  const validObject = Boolean(input) && typeof input === "object" && !Array.isArray(input);
  const flagsValid = validObject && booleanKeys.every((key) => typeof (input as unknown as Record<string, unknown>)[key] === "boolean");
  const goalValid = validObject && validGoals.includes(String((input as unknown as Record<string, unknown>).goal));
  const budgetValid = validObject && flagsValid && goalValid &&
    Number.isSafeInteger(input.dailyBudgetCents) && input.dailyBudgetCents >= 0 &&
    Number.isSafeInteger(input.approvedDailyBudgetCents) && input.approvedDailyBudgetCents >= 0 &&
    input.dailyBudgetCents <= input.approvedDailyBudgetCents;
  const safeGoal = goalValid ? input.goal : fallbackGoal;
  const safeInput: AcquisitionPlanInput = validObject ? input : {
    goal: fallbackGoal,
    dailyBudgetCents: -1,
    approvedDailyBudgetCents: 0,
    funnelHasVerifiedAnalytics: false,
    websiteAuditAvailable: false,
    leadCaptureAvailable: false,
    calendarAvailable: false,
    paymentFlowVerified: false,
    outboundProviderVerified: false,
  };
  const steps: AcquisitionPlan["steps"] = [
    { id: "measure", title: "Measure funnel", mode: safeInput.funnelHasVerifiedAnalytics ? "autonomous_read_only" : "prepare_for_approval", reason: safeInput.funnelHasVerifiedAnalytics ? "Use verified, aggregate funnel events only." : "Analytics evidence is missing; validate instrumentation before claiming conversion performance." },
    { id: "site_audit", title: "Find conversion blockers", mode: safeInput.websiteAuditAvailable ? "autonomous_read_only" : "blocked", reason: safeInput.websiteAuditAvailable ? "Run bounded read-only site, mobile, accessibility, and SEO checks." : "Website audit capability is unavailable." },
    { id: "lead_capture", title: "Check lead capture", mode: safeInput.leadCaptureAvailable ? "autonomous_read_only" : "prepare_for_approval", reason: safeInput.leadCaptureAvailable ? "Verify forms and report aggregate delivery outcomes." : "Lead capture is not verified; do not promise lead delivery." },
    { id: "offer", title: "Prepare conversion improvements", mode: "prepare_for_approval", reason: "Draft landing-page, offer, and copy improvements for owner review; never invent proof or guaranteed outcomes." },
    { id: "followup", title: "Follow up with eligible leads", mode: safeInput.outboundProviderVerified ? "prepare_for_approval" : "blocked", reason: safeInput.outboundProviderVerified ? "Only explicit opt-ins, approved templates, verified tenant scope, quiet hours, idempotency, and send budgets qualify." : "No verified outbound provider; prepare recommendations only." },
    { id: "booking", title: "Reduce booking friction", mode: safeInput.calendarAvailable ? "prepare_for_approval" : "blocked", reason: safeInput.calendarAvailable ? "Propose a booking CTA using verified availability; do not create appointments without authorization." : "Calendar capability is not verified." },
    { id: "checkout", title: "Verify paid conversion path", mode: safeInput.paymentFlowVerified ? "autonomous_read_only" : "prepare_for_approval", reason: safeInput.paymentFlowVerified ? "Run a read-only entitlement and checkout contract check; never create a charge." : "Payment flow needs a sandbox/test verification before being treated as healthy." },
  ];
  if (!budgetValid) {
    return { status: "blocked", goal: safeGoal, steps: steps.map(step => ({ ...step, mode: "blocked", reason: "Plan inputs must use a known goal, explicit boolean capability flags, and a non-negative safe-integer budget no greater than the owner-approved budget." })), budgetCents: 0, note: "No spend or paid provider call is authorized because the plan input is invalid or exceeds the approved budget." };
  }
  return {
    status: steps.some(step => step.mode === "blocked") ? "blocked" : "ready_for_review",
    goal: safeGoal,
    steps,
    budgetCents: input.dailyBudgetCents,
    note: "This planner prepares a measurable acquisition run. It does not send messages, spend money, publish changes, or guarantee customer/revenue outcomes.",
  };
}
