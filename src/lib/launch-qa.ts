/**
 * Revora launch QA — browser-safe, deterministic checks.
 *
 * These checks verify the parts of the website that actually earn customers:
 * the calls to action, the lead forms, where enquiries are routed, how they land
 * in the CRM, and what the customer sees afterwards. Nothing is assumed — every
 * check reads real rows from the workspace, and every failure carries a fix the
 * owner can act on.
 */

export type CaptureCheck = {
  key: string;
  label: string;
  ok: boolean;
  severity: "blocker" | "advice";
  /** What Revora found — always the real state, pass or fail. */
  detail: string;
  /** The concrete next step when the check fails. */
  fix: string;
  to?: string;
};

export type CaptureQaInput = {
  primaryCtaLabel: string | null;
  secondaryCtaLabel: string | null;
  phone: string | null;
  email: string | null;
  /** Active quote calculators. */
  quoteForms: number;
  /** Questions across those calculators. */
  quoteQuestions: number;
  /** Services a visitor can book online. */
  bookableServices: number;
  /** Visible sections that contain a form or a booking widget. */
  captureSections: number;
  /** Leads that already arrived from the public site. */
  siteLeads: number;
  /** Lead timeline rows created for those leads (CRM mapping). */
  loggedActivities: number;
  /** Active automations that confirm or follow up an enquiry. */
  confirmationAutomations: number;
  /** Whether the workspace receives an internal alert on a new lead. */
  notifiesOwner: boolean;
};

const check = (
  key: string,
  label: string,
  ok: boolean,
  detail: string,
  fix: string,
  severity: CaptureCheck["severity"] = "blocker",
  to?: string,
): CaptureCheck => ({ key, label, ok, severity, detail, fix, ...(to ? { to } : {}) });

/**
 * Lead-capture and booking QA. Blockers stop a launch from being called ready;
 * advice items are real improvements that don't break the flow.
 */
export function captureQa(input: CaptureQaInput) {
  const hasContact = Boolean(input.phone?.trim() || input.email?.trim());
  const capture = input.quoteForms > 0 || input.bookableServices > 0;

  const checks: CaptureCheck[] = [
    check(
      "cta",
      "Main call to action",
      Boolean(input.primaryCtaLabel?.trim()),
      input.primaryCtaLabel?.trim()
        ? `Visitors see “${input.primaryCtaLabel.trim()}” as the main button.`
        : "No main button label is set, so the hero has nothing to click.",
      "Set the main button label on your website settings.",
      "blocker",
      "/app/website",
    ),
    check(
      "secondary-cta",
      "Backup call to action",
      Boolean(input.secondaryCtaLabel?.trim()),
      input.secondaryCtaLabel?.trim()
        ? `Second button reads “${input.secondaryCtaLabel.trim()}”.`
        : "There's no second option for visitors who aren't ready to enquire.",
      "Add a secondary button such as “See services” or “Call now”.",
      "advice",
      "/app/website",
    ),
    check(
      "capture",
      "A way to enquire",
      capture,
      capture
        ? `${input.quoteForms} quote calculator${input.quoteForms === 1 ? "" : "s"} and ${input.bookableServices} bookable service${input.bookableServices === 1 ? "" : "s"} are live.`
        : "Nobody can request a quote or book online yet.",
      "Turn on the quote calculator or make at least one service bookable.",
      "blocker",
      "/app/quotes",
    ),
    check(
      "quote-questions",
      "Quote calculator asks useful questions",
      input.quoteForms === 0 || input.quoteQuestions >= 2,
      input.quoteForms === 0
        ? "No quote calculator is active."
        : `${input.quoteQuestions} question${input.quoteQuestions === 1 ? "" : "s"} configured.`,
      "Add at least two questions so the estimate and the lead detail are meaningful.",
      input.quoteForms === 0 ? "advice" : "blocker",
      "/app/quotes",
    ),
    check(
      "routing",
      "Forms appear where visitors decide",
      input.captureSections > 0,
      input.captureSections > 0
        ? `${input.captureSections} visible section${input.captureSections === 1 ? "" : "s"} route visitors into a form or booking.`
        : "No visible section links to your form or booking flow.",
      "Keep a quote or booking section visible on your home page.",
      "blocker",
      "/app/website",
    ),
    check(
      "contact",
      "Direct contact route",
      hasContact,
      hasContact
        ? `Customers can reach you on ${[input.phone?.trim(), input.email?.trim()].filter(Boolean).join(" and ")}.`
        : "No phone or email is published, so there's no fallback to the form.",
      "Add your phone number and email to your business details.",
      "blocker",
      "/app/website",
    ),
    check(
      "crm",
      "Enquiries land in your CRM",
      input.siteLeads === 0 || input.loggedActivities > 0,
      input.siteLeads === 0
        ? "No enquiries have come in yet — routing is configured and will be confirmed by the first one."
        : `${input.siteLeads} enquir${input.siteLeads === 1 ? "y" : "ies"} arrived and ${input.loggedActivities} timeline event${input.loggedActivities === 1 ? "" : "s"} were recorded.`,
      "Open a lead and check the timeline; re-submit a test enquiry if nothing is recorded.",
      "blocker",
      "/app/leads",
    ),
    check(
      "owner-alert",
      "You get told about new enquiries",
      input.notifiesOwner,
      input.notifiesOwner
        ? "New enquiries raise an alert in your dashboard."
        : "New enquiries wouldn't alert you anywhere.",
      "Keep lead notifications on so nothing sits unanswered.",
      "blocker",
      "/app/settings",
    ),
    check(
      "confirmation",
      "Customer gets a confirmation or follow-up",
      input.confirmationAutomations > 0,
      input.confirmationAutomations > 0
        ? `${input.confirmationAutomations} active automation${input.confirmationAutomations === 1 ? "" : "s"} reply to new enquiries and bookings.`
        : "Nothing replies to a customer after they enquire.",
      "Switch on a follow-up automation for new leads and new bookings.",
      "advice",
      "/app/automations",
    ),
  ];

  const blockers = checks.filter((c) => !c.ok && c.severity === "blocker");
  return { checks, blockers, passed: blockers.length === 0 };
}

/* ------------------------------- missing facts ------------------------------ */

export type FactGap = {
  key: string;
  label: string;
  /** What Revora needs, in the owner's language. */
  prompt: string;
  required: boolean;
  /** Where the answer is saved: a business profile column, or advice only. */
  field?: string;
  multiline?: boolean;
};

export type FactInput = {
  businessName?: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  serviceArea: string | null;
  servicesCount: number;
  serviceNames?: string[];
  photoCount: number;
  hasHours: boolean;
  /** Extra requests the AI analysis raised, in plain language. */
  briefRequests: string[];
};

/**
 * Only the blanks. Required gaps block a build, because without them the site
 * cannot honestly say who the business is, where it works or how to reach it.
 */
export function factGaps(input: FactInput): FactGap[] {
  const gaps: FactGap[] = [];
  const blank = (v: string | null | undefined) => !v || !v.trim();
  const weakText = (value: string | null | undefined, minimum: number) => {
    const text = (value ?? "").trim();
    if (text.length < minimum) return true;
    const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^(?:test|sample|businessname|mybusiness|companyname|qwerty|asdfgh|none|na)$/.test(compact)) return true;
    return /^(.{1,2})\1{2,}$/.test(compact);
  };

  if (input.businessName !== undefined && weakText(input.businessName, 2))
    gaps.push({
      key: "business-name",
      label: "Your real business name",
      prompt: "Add the name customers know your business by.",
      required: true,
      field: "business_name",
    });
  if (weakText(input.description, 12))
    gaps.push({
      key: "description",
      label: "What your business does",
      prompt: "Describe what you do and who you help in one clear sentence.",
      required: true,
      field: "description",
      multiline: true,
    });
  if (blank(input.phone))
    gaps.push({
      key: "phone",
      label: "Phone number",
      prompt: "The number customers should call.",
      required: true,
      field: "phone",
    });
  if (blank(input.city))
    gaps.push({
      key: "city",
      label: "Your city",
      prompt: "The town or city you're based in.",
      required: true,
      field: "city",
    });
  if (
    input.servicesCount < 1 ||
    (input.serviceNames?.length && input.serviceNames.every((name) => weakText(name, 5)))
  )
    gaps.push({
      key: "services",
      label: "Services you offer",
      prompt: "List your services, one per line — Revora builds a page for each one.",
      required: true,
      field: "services_list",
      multiline: true,
    });

  if (blank(input.email))
    gaps.push({
      key: "email",
      label: "Email address",
      prompt: "Where enquiries should be emailed.",
      required: false,
      field: "email",
    });
  if (blank(input.serviceArea))
    gaps.push({
      key: "service_area",
      label: "Areas you serve",
      prompt: "List the areas or radius you cover — this drives local search.",
      required: false,
      field: "service_area",
    });
  if (!input.hasHours)
    gaps.push({
      key: "hours",
      label: "Opening hours",
      prompt: "Set your opening hours in your business details.",
      required: false,
    });
  if (input.photoCount < 5)
    gaps.push({
      key: "photos",
      label: "Photos of your work",
      prompt: "Upload at least five photos of jobs you've completed.",
      required: false,
    });

  for (const request of input.briefRequests.slice(0, 5)) {
    gaps.push({
      key: `brief-${request.slice(0, 24)}`,
      label: "Revora asked for this",
      prompt: request,
      required: false,
    });
  }

  return gaps;
}

export const requiredFactGaps = (input: FactInput) => factGaps(input).filter((g) => g.required);
