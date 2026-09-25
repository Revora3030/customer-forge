/** Client-site addressing, review workflow, and intake choices. */

import type { Tone } from "@/lib/domain";
import { slugify } from "@/lib/format";

/**
 * The only Revora-owned host. A client website lives on the domain the client
 * owns; until then it is reachable at `revoragrowthsystems.com/s/<slug>`.
 * Revora-branded client subdomains do not exist and must not be reintroduced.
 */
export const REVORA_HOST = "revoragrowthsystems.com";

/** Slugs we never hand to a client site path. */
export const RESERVED_SLUGS = [
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "mail",
  "cdn",
  "assets",
  "static",
  "support",
  "help",
  "docs",
  "blog",
  "status",
  "demo",
  "revora",
  "dashboard",
  "login",
  "billing",
  "s",
];

export function safeSlug(value: string, fallback = "my-business") {
  const base = slugify(value || "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!base) return fallback;
  if (RESERVED_SLUGS.includes(base)) return `${base}-business`;
  if (/^\d+$/.test(base)) return `biz-${base}`;
  return base;
}

/** The always-working Revora share address for a client website. */
export function revoraShareAddress(slug: string | null | undefined) {
  return `${REVORA_HOST}/s/${safeSlug(slug ?? "")}`;
}

/* ------------------------------ review states ------------------------------ */

export type ReviewState =
  | "onboarding"
  | "generating"
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "domain_setup"
  | "publishing"
  | "live"
  | "suspended";

export const REVIEW_STATES: Record<
  ReviewState,
  { label: string; tone: Tone; help: string; clientAction: string | null }
> = {
  onboarding: {
    label: "Onboarding",
    tone: "neutral",
    help: "We still need your business information before the website can be assembled.",
    clientAction: "Finish your business details",
  },
  generating: {
    label: "Generating",
    tone: "info",
    help: "Revora is assembling your website from the information you provided.",
    clientAction: null,
  },
  ready_for_review: {
    label: "Ready for review",
    tone: "attention",
    help: "Your website draft is ready. Review it on desktop and mobile, then approve or request changes.",
    clientAction: "Review your website",
  },
  changes_requested: {
    label: "Changes requested",
    tone: "attention",
    help: "Your change request is with the Revora team. This is awaiting Revora review — it is not automatic.",
    clientAction: null,
  },
  approved: {
    label: "Approved",
    tone: "signal",
    help: "You approved the website. Revora runs a final quality check before publishing.",
    clientAction: "Choose your web address",
  },
  domain_setup: {
    label: "Domain setup",
    tone: "info",
    help: "You can launch on your Revora share link now, or finish connecting your own domain.",
    clientAction: "Connect a domain or launch on your Revora share link",
  },
  publishing: {
    label: "Publishing",
    tone: "info",
    help: "Revora is completing the final publish steps.",
    clientAction: null,
  },
  live: {
    label: "Live",
    tone: "signal",
    help: "Your website is live and connected to lead capture, bookings, quotes, follow-up and analytics.",
    clientAction: null,
  },
  suspended: {
    label: "Suspended",
    tone: "danger",
    help: "This website is suspended. Contact Revora to restore it.",
    clientAction: null,
  },
};

export const reviewStateMeta = (state: string | null | undefined) =>
  REVIEW_STATES[(state ?? "onboarding") as ReviewState] ?? REVIEW_STATES.onboarding;

export const REVIEW_FLOW: ReviewState[] = [
  "onboarding",
  "generating",
  "ready_for_review",
  "approved",
  "domain_setup",
  "publishing",
  "live",
];

/* --------------------------- website change requests --------------------------- */

export const REQUEST_STATUSES: { value: string; label: string; tone: Tone }[] = [
  { value: "new", label: "New", tone: "attention" },
  { value: "in_progress", label: "In progress", tone: "info" },
  { value: "waiting_client", label: "Waiting for client", tone: "neutral" },
  { value: "completed", label: "Completed", tone: "signal" },
];

export const requestStatusMeta = (status: string | null | undefined) =>
  REQUEST_STATUSES.find((s) => s.value === status) ?? REQUEST_STATUSES[0]!;

export const REQUEST_PRIORITIES: { value: string; label: string; tone: Tone }[] = [
  { value: "low", label: "Low", tone: "neutral" },
  { value: "normal", label: "Normal", tone: "info" },
  { value: "high", label: "High", tone: "danger" },
];

export const REQUEST_KINDS: { value: string; label: string }[] = [
  { value: "change", label: "Content or design change" },
  { value: "structure", label: "New page or section" },
  { value: "integration", label: "Booking, quote or CRM setup" },
  { value: "domain", label: "Domain or launch help" },
  { value: "other", label: "Something else" },
];

/* --------------------------------- generation --------------------------------- */

export type GoalKey =
  "call" | "text" | "quote" | "book" | "lead" | "visit" | "purchase" | "consult";

export const WEBSITE_GOALS: { value: GoalKey; label: string; cta: string }[] = [
  { value: "call", label: "Call us", cta: "Call now" },
  { value: "text", label: "Text us", cta: "Text us" },
  { value: "quote", label: "Request a quote", cta: "Get my quote" },
  { value: "book", label: "Book an appointment", cta: "Book now" },
  { value: "lead", label: "Submit a lead form", cta: "Get in touch" },
  { value: "visit", label: "Visit our location", cta: "Get directions" },
  { value: "purchase", label: "Purchase online", cta: "Buy now" },
  { value: "consult", label: "Request a consultation", cta: "Request a consultation" },
];

