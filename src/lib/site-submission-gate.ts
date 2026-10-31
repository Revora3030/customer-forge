/**
 * The public-submission publish gate, mirrored from the database.
 *
 * `public.submit_public_conversion` (supabase/migrations/20260905024849_…sql)
 * refuses every public form submission with ORG_NOT_PUBLIC unless:
 *
 *   organizations.is_suspended is not true
 *   AND ( organizations.is_demo
 *         OR website_settings.published
 *         OR website_settings.publish_state IN ('published', 'preview', 'draft') )
 *
 * A workspace with no website_settings row only passes as a demo. 'unpublished'
 * (taken offline by the owner) and suspended workspaces are still refused; the
 * database's own rate limits and validation apply to draft sites too. The database
 * stays the authority; this copy exists so the site can say "not live yet"
 * up front instead of letting a visitor fill in a form that cannot be saved.
 */
export const SITE_NOT_LIVE_MESSAGE =
  "This site isn't live yet, so forms will start working once the owner publishes it.";

export type SubmissionGateFacts = {
  isDemo?: boolean | null;
  isSuspended?: boolean | null;
  /** website_settings.published; null/undefined when there is no settings row. */
  published?: boolean | null;
  /** website_settings.publish_state; null/undefined when there is no settings row. */
  publishState?: string | null;
};

export function siteAcceptsSubmissions(facts: SubmissionGateFacts): boolean {
  if (facts.isSuspended) return false;
  return (
    Boolean(facts.isDemo) ||
    Boolean(facts.published) ||
    facts.publishState === "published" ||
    facts.publishState === "preview" ||
    facts.publishState === "draft"
  );
}

/** Visitor-facing wording for a database error raised while saving a public submission. */
export function publicSubmissionErrorMessage(dbMessage: string | null | undefined): string {
  const message = dbMessage ?? "";
  if (message.includes("ORG_NOT_PUBLIC")) return SITE_NOT_LIVE_MESSAGE;
  if (message.includes("BOOKING_CONFLICT") || message.includes("appointments_no_overlap")) {
    return "That time was just taken. Please pick another time.";
  }
  if (message.includes("TIME_IN_PAST")) return "Please pick a time in the future.";
  if (message.includes("INVALID_TIME")) return "Pick a valid appointment time.";
  if (message.includes("INVALID_SERVICE") || message.includes("INVALID_QUOTE_FORM")) {
    return "That service is no longer available. Please refresh and try again.";
  }
  if (message.includes("RATE_LIMITED")) {
    return "We've already received your details. Please wait a few minutes before sending again.";
  }
  if (message.includes("CONTACT_REQUIRED"))
    return "Add an email or phone number so we can reach you.";
  if (message.includes("INVALID_EMAIL")) return "That email address doesn't look right.";
  return "We couldn't save your request. Please try again.";
}
