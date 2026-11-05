/**
 * CG-15 (G-SGE-5): the enquiry form as two short steps when the business
 * offers more than one service. Step 1 asks what the visitor needs (the
 * owner's own services, never invented ones) and how soon; step 2 is the
 * existing contact form with its spam protection (honeypot, ALTCHA,
 * Turnstile, server rate limit). The answers reach the CRM through the same
 * protected submit: the service as serviceId/serviceInterest, the timing as a
 * plain line on the message.
 */
export const ENQUIRY_TIMINGS = [
  { id: "asap", label: "As soon as possible" },
  { id: "weeks", label: "In the next few weeks" },
  { id: "planning", label: "Just planning ahead" },
] as const;

export type EnquiryTimingId = (typeof ENQUIRY_TIMINGS)[number]["id"];

/** Two or more named services are worth a first "what do you need?" step. */
export function enquiryUsesSteps(services: readonly { name?: string | null }[]): boolean {
  return services.filter((s) => (s.name ?? "").trim()).length > 1;
}

export function timingLabel(id: string | null | undefined): string | null {
  return ENQUIRY_TIMINGS.find((t) => t.id === id)?.label ?? null;
}

/** The visitor's words first; the timing they picked on its own line after. */
export function composeEnquiryMessage(message: string, timingId: string | null | undefined, max = 2000): string {
  const label = timingLabel(timingId);
  const body = message.trim();
  if (!label) return body.slice(0, max);
  const suffix = `\n\nTiming: ${label}`;
  return `${body.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}
