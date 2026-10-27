/**
 * Win-back list: past customers who have gone quiet, with a plain message the owner sends themselves.
 * Nothing here sends anything. It reads the owner's own customer records, builds a draft, and the owner
 * opens it in their own text or email app. Prices and offers are only what the owner types.
 */
export type WinbackCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: readonly string[] | null;
  created_at: string;
  last_appointment_at: string | null;
  next_appointment_at: string | null;
};

export const DORMANT_OPTIONS = [90, 180, 365] as const;
export const DEFAULT_DORMANT_DAYS = 180;
/** Someone just messaged is left alone for this long. */
export const RECONTACT_HOLD_DAYS = 90;
export const MAX_WINBACK_ROWS = 25;
const DAY = 86_400_000;

const OPT_OUT_TAGS = new Set(["do not contact", "do-not-contact", "dnc", "unsubscribed", "opted out", "opt out", "stop"]);
const WINBACK_TAG = /^winback:(\d{4}-\d{2}-\d{2})$/;

export const winbackTag = (now: Date) => `winback:${now.toISOString().slice(0, 10)}`;

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

export type DormantCustomer = WinbackCustomer & { lastSeen: string; daysQuiet: number };

/** Customers quiet for at least `dormantDays`, longest quiet first. Opted-out, booked-ahead and recently messaged people are left out. */
export function findDormant(
  customers: readonly WinbackCustomer[],
  now: Date = new Date(),
  dormantDays: number = DEFAULT_DORMANT_DAYS,
): { shown: DormantCustomer[]; total: number } {
  const nowMs = now.getTime();
  const out: DormantCustomer[] = [];
  for (const customer of customers) {
    if (!customer.email?.trim() && !customer.phone?.trim()) continue;
    const tags = (customer.tags ?? []).map((tag) => tag.trim().toLowerCase());
    if (tags.some((tag) => OPT_OUT_TAGS.has(tag))) continue;
    const held = tags.some((tag) => {
      const match = WINBACK_TAG.exec(tag);
      const at = match ? ms(`${match[1]}T00:00:00Z`) : null;
      return at !== null && nowMs - at < RECONTACT_HOLD_DAYS * DAY;
    });
    if (held) continue;
    const next = ms(customer.next_appointment_at);
    if (next !== null && next > nowMs) continue;
    const seenAt = ms(customer.last_appointment_at) ?? ms(customer.created_at);
    if (seenAt === null || seenAt > nowMs) continue;
    const daysQuiet = Math.floor((nowMs - seenAt) / DAY);
    if (daysQuiet < dormantDays) continue;
    out.push({ ...customer, lastSeen: new Date(seenAt).toISOString(), daysQuiet });
  }
  out.sort((a, b) => b.daysQuiet - a.daysQuiet);
  return { shown: out.slice(0, MAX_WINBACK_ROWS), total: out.length };
}

const firstName = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first && /^[\p{L}'’.-]+$/u.test(first) ? first : "";
};

export type WinbackDraft = { text: string; emailSubject: string; emailBody: string };

/** A short, honest check-in. The offer line is the owner's own words or it is left out. */
export function winbackDraft(customerName: string, businessName: string, offer: string): WinbackDraft {
  const hi = firstName(customerName) ? `Hi ${firstName(customerName)}` : "Hi there";
  const extra = offer.trim().slice(0, 200);
  const business = businessName.trim() || "us";
  const text = [`${hi}, it's ${business}.`, "It's been a while since we last saw you. Want me to put you on the schedule?", extra, "Reply STOP and I won't text again."]
    .filter(Boolean)
    .join(" ");
  const emailBody = [
    `${hi},`,
    "",
    `It's been a while since we last worked together, and I wanted to check in. If you need anything, just reply and we'll find a time.`,
    ...(extra ? ["", extra] : []),
    "",
    "If you'd rather not hear from me, reply and I'll stop.",
    "",
    business === "us" ? "Thanks" : `Thanks, ${business}`,
  ].join("\n");
  return { text, emailSubject: `Checking in from ${business}`, emailBody };
}

/** sms: link that works on both iPhone and Android. Only digits and a leading + are kept. */
export function smsHref(phone: string, body: string): string | null {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 7) return null;
  return `sms:${cleaned}?&body=${encodeURIComponent(body)}`;
}

export function mailHref(email: string, subject: string, body: string): string | null {
  const address = email.trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address)) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function quietLabel(days: number): string {
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
}
