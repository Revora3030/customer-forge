/**
 * Review-request DRAFT for a lead the owner marked Completed with no booking.
 * Everything here is plain data and links: nothing is queued, saved or sent.
 * The owner reads the wording, then sends it themselves from their own email or
 * phone app (or copies it). The platform's consent checks still decide whether
 * a draft is offered at all (see lead-review-draft.server.ts).
 */

export type DraftChannel = "email" | "sms";

export type DraftBlockReason =
  | "no_contact"
  | "recipient_suppressed"
  | "sms_no_opt_in"
  | "sms_region_unsupported"
  | "sms_quiet_hours"
  | "consent_lookup_unavailable"
  | "appointment_already_started";

export type ChannelDraft =
  | { channel: DraftChannel; allowed: true; recipient: string; subject: string; body: string; href: string }
  | { channel: DraftChannel; allowed: false; reason: DraftBlockReason };

export type LeadReviewDraft =
  | { eligible: false; reason: "not_completed" | "has_booking" }
  | {
      eligible: true;
      leadName: string;
      /** No review link saved: the wording has no link until the owner adds one. */
      needsReviewLink: boolean;
      drafts: ChannelDraft[];
    };

/** Plain-English reasons shown next to a channel that was held back. */
export const DRAFT_BLOCK_MESSAGES: Record<DraftBlockReason, string> = {
  no_contact: "No contact details on this lead.",
  recipient_suppressed: "This person asked not to be contacted, so no draft is offered.",
  sms_no_opt_in: "No text opt-in on record for this number, so no text draft is offered.",
  sms_region_unsupported: "Text drafts are only offered for US and Canada numbers.",
  sms_quiet_hours: "It's outside text hours (9am–8pm) for this number. Try again later.",
  consent_lookup_unavailable: "Couldn't check this person's contact preferences just now. Try again in a few minutes.",
  appointment_already_started: "This booking has already started.",
};

/** mailto: link that opens the owner's own mail app with the draft filled in. */
export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** sms: link that opens the owner's own messages app. Keeps digits and a leading +. */
export function smsHref(phone: string, body: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return `sms:${cleaned}?&body=${encodeURIComponent(body)}`;
}
