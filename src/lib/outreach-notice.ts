/**
 * CAN-SPAM 7704(a)(5)(A)(i): cold outreach must say it is an advertisement.
 * It lives in the system-appended footer and the email template, never in the
 * editable message, so operator text can't remove it.
 */
export const OUTREACH_PROMOTIONAL_NOTICE = "This email is an advertisement: a promotional message from Revora Growth Systems.";
