/**
 * The one follow-up email for a prospect demo.
 *
 * Rule (owner decision): exactly one follow-up, only by email, no sooner than
 * 48 hours after the first email, and never when the business replied, opted
 * out, claimed the demo or already got a follow-up. After 14 days it's too
 * late to be welcome, so none is sent.
 */
export const FOLLOW_UP_AFTER_HOURS = 48;
export const FOLLOW_UP_WINDOW_DAYS = 14;

export type FollowUpFacts = {
  firstSentAt: string | null;
  followUpSent: boolean;
  replied: boolean;
  claimed: boolean;
  now: Date;
};

export function followUpDue(facts: FollowUpFacts): boolean {
  if (!facts.firstSentAt || facts.followUpSent || facts.replied || facts.claimed) return false;
  const sent = Date.parse(facts.firstSentAt);
  if (!Number.isFinite(sent)) return false;
  const age = facts.now.getTime() - sent;
  return age >= FOLLOW_UP_AFTER_HOURS * 3_600_000 && age <= FOLLOW_UP_WINDOW_DAYS * 86_400_000;
}

/** Short, honest follow-up text. The legal footer and unsubscribe link are added by the sender. */
export function composeFollowUp(businessName: string, previewUrl: string): { subject: string; body: string } {
  return {
    subject: `Following up: the website preview for ${businessName}`.slice(0, 140),
    body: [
      "Hi,",
      "",
      `I'm following up on the free website preview I made for ${businessName}, in case my last email got buried:`,
      previewUrl,
      "",
      "If you'd like it, you can claim it from that page. If it's not for you, just reply \"no thanks\" and I won't write again.",
    ].join("\n"),
  };
}
