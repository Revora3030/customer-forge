/**
 * Field checks for a public lead form submission. Exported so the owner's
 * in-chat lead simulation (B12-3) runs the exact same validation.
 */
export const parsePublicLeadInput = (input: {
  slug: string;
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  city?: string;
  serviceId?: string | null;
  serviceInterest?: string | null;
  source?: string;
  campaign?: string | null;
  /**
   * Visitor session id (the site's own opaque token, when the browser
   * supplies one). Used to de-duplicate the server-side conversion event
   * against the client beacon that may have fired for the same visit.
   */
  sessionId?: string | null;
  kind: "inquiry" | "quote" | "booking" | "consultation" | "contact";
  estimatedValue?: number;
  quote?: {
    formId: string | null;
    answers: { question: string; answer: string; modifier: number }[];
    min: number;
    max: number;
  } | null;
  booking?: {
    startsAt: string;
    durationMinutes: number;
    /** Wall-clock date/time the visitor picked, in the business's calendar. */
    localDate?: string;
    localTime?: string;
  } | null;
  /**
   * Honeypot: a field real visitors never see or fill in (kept invisible
   * and unlabeled in the form), so anything other than empty means a bot
   * filled every input it found. Caught submissions are accepted and
   * silently dropped rather than rejected, so scripted senders see a
   * normal "success" response and have no signal to adapt around.
   */
  companyWebsite?: string;
  /** ALTCHA proof-of-work payload (src/lib/altcha.server.ts). */
  altcha?: string;
  /** Cloudflare Turnstile token (src/lib/turnstile.server.ts); absent when not set up. */
  turnstile?: string;
}) => {
  const clean = (v: unknown, max: number) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const isBot = clean(input.companyWebsite, 200).length > 0;
  const name = clean(input.name, 120);
  if (name.length < 2) throw new Error("Please enter your name.");
  const email = clean(input.email, 160);
  const phone = clean(input.phone, 40);
  if (!email && !phone) throw new Error("Add an email or phone number so we can reach you.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("That email address doesn't look right.");
  }
  if (!/^[a-z0-9-]+$/.test(String(input.slug ?? ""))) throw new Error("Invalid business address");
  const KINDS = ["inquiry", "quote", "booking", "consultation", "contact"] as const;
  const kind = (KINDS as readonly string[]).includes(String(input.kind)) ? input.kind : "inquiry";
  // A booking label and booking details must travel together: a "booking"
  // with no time skipped every booking check yet was saved as booked.
  if (kind === "booking" && !input.booking) throw new Error("Choose a date and time to book.");
  const booking = kind === "booking" ? input.booking : null;
  const serviceId = typeof input.serviceId === "string" && /^[0-9a-f-]{36}$/i.test(input.serviceId) ? input.serviceId : null;
  return {
    ...input,
    kind,
    booking,
    serviceId,
    source: clean(input.source, 80) || "website",
    campaign: clean(input.campaign, 120) || null,
    name,
    email,
    phone,
    message: clean(input.message, 2000),
    city: clean(input.city, 120),
    serviceInterest: clean(input.serviceInterest, 160),
    estimatedValue: Math.max(0, Math.min(1_000_000, Number(input.estimatedValue ?? 0))),
    sessionId: /^[A-Za-z0-9_-]{6,60}$/.test(String(input?.sessionId ?? ""))
      ? String(input.sessionId)
      : null,
    isBot,
    altcha: clean(input.altcha, 4000),
    turnstile: clean(input.turnstile, 2048),
  };
};

export type PublicLeadInput = Parameters<typeof parsePublicLeadInput>[0];
