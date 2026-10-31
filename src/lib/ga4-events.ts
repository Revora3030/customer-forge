/**
 * GA4 recommended conversion events, fired only after the server or auth
 * provider has accepted the action. Call these from a success path, never from
 * a submit handler's start: a failed or rejected attempt is not a lead or a
 * sign-up. They are no-ops when GA4 is not loaded or the visitor declined.
 */

import { ga4Event } from "./ga4";

/** A real lead-form submission the server accepted. */
export function ga4GenerateLead(source: "contact_form" | "growth_assessment" | "website_audit") {
  ga4Event("generate_lead", { lead_source: source });
}

/** A real account creation the auth provider accepted. */
export function ga4SignUp(method: "email") {
  ga4Event("sign_up", { method });
}
