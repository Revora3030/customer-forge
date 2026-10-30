import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { REVORA } from "@/lib/brand";

/**
 * Public contact form submission.
 *
 * The contact page used to only show a success message without recording
 * anything, so genuine enquiries were lost. Every submission is now normalized,
 * length-capped, stored in the platform funnel table and emailed to the Revora
 * inbox so it can actually be answered.
 */

const text = (value: unknown, max: number) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw.slice(0, max) : "";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Abuse limits. The per-email limit alone was bypassable by rotating
 * addresses, so the connection is limited too (same approach as the public
 * assessment form in assessment.functions.ts).
 */
export const CONTACT_EMAIL_LIMIT_PER_10_MIN = 5;
export const CONTACT_IP_LIMIT_PER_HOUR = 10;

export function isContactThrottled(counts: { byEmail: number | null; byIp: number | null }): boolean {
  return (
    (counts.byEmail ?? 0) >= CONTACT_EMAIL_LIMIT_PER_10_MIN ||
    (counts.byIp ?? 0) >= CONTACT_IP_LIMIT_PER_HOUR
  );
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Edge-controlled client IP only; spoofable forwarding headers are ignored. */
function clientIp(): string | null {
  try {
    const headers = getRequest().headers;
    return headers.get("cf-connecting-ip")?.trim() || headers.get("true-client-ip")?.trim() || null;
  } catch {
    return null;
  }
}

export interface ContactSubmission {
  name: string;
  email: string;
  business?: string | null;
  phone?: string | null;
  businessType?: string | null;
  interest?: string | null;
  message: string;
  landingPath?: string | null;
  sessionId?: string | null;
  /** ALTCHA proof-of-work payload (src/lib/altcha.server.ts). */
  altcha?: string | null;
}

export const submitContactRequest = createServerFn({ method: "POST" })
  .validator((input: ContactSubmission) => {
    const email = text(input?.email, 160).toLowerCase();
    const name = text(input?.name, 120);
    const message = text(input?.message, 4000);
    if (!name) throw new Error("Please add your name.");
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email so we can reply.");
    if (message.length < 4) throw new Error("Please tell us a little about what you need.");
    return {
      name,
      email,
      message,
      business: text(input?.business, 160) || null,
      phone: text(input?.phone, 40) || null,
      businessType: text(input?.businessType, 120) || null,
      interest: text(input?.interest, 120) || null,
      landingPath: text(input?.landingPath, 200) || null,
      sessionId: text(input?.sessionId, 60) || null,
      altcha: text(input?.altcha, 4000),
    };
  })
  .handler(async ({ data }) => {
    // ALTCHA: a forged or expired payload gets a quiet "ok" and is not stored
    // or emailed. Missing payloads and verifier outages fail open.
    const { verifyAltchaPayload } = await import("@/lib/altcha.server");
    if ((await verifyAltchaPayload(data.altcha)) === "invalid") {
      return { ok: true as const, stored: false, emailed: false, throttled: false as const };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Abuse guard: neither a single sender nor a single connection can flood
    // the inbox. The IP is stored only as a SHA-256 hash.
    const ip = clientIp();
    const ipHash = ip ? await sha256Hex(`contact|${ip}`) : null;
    const [byEmail, byIp] = await Promise.all([
      supabaseAdmin
        .from("marketing_conversions")
        .select("id", { count: "exact", head: true })
        .eq("event_name", "contact_submitted")
        .eq("email", data.email)
        .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString()),
      ipHash
        ? supabaseAdmin
            .from("marketing_conversions")
            .select("id", { count: "exact", head: true })
            .eq("event_name", "contact_submitted")
            .contains("metadata", { ip_hash: ipHash })
            .gte("created_at", new Date(Date.now() - 3_600_000).toISOString())
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (byEmail.error || byIp.error) {
      console.error("submitContactRequest rate check failed", (byEmail.error ?? byIp.error)?.message);
    }
    if (isContactThrottled({ byEmail: byEmail.count, byIp: byIp.count })) {
      return { ok: true as const, stored: false, emailed: false, throttled: true as const };
    }

    const { error } = await supabaseAdmin.from("marketing_conversions").insert({
      event_name: "contact_submitted",
      landing_path: data.landingPath,
      session_id: data.sessionId,
      email: data.email,
      metadata: {
        name: data.name,
        business: data.business ?? "",
        phone: data.phone ?? "",
        business_type: data.businessType ?? "",
        interest: data.interest ?? "",
        message: data.message.slice(0, 500),
        ...(ipHash ? { ip_hash: ipHash } : {}),
      } as never,
    });
    if (error) {
      console.error("submitContactRequest insert failed", error.message);
      throw new Error("We could not save your message. Please email us directly.");
    }

    let emailed = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const sent = await sendTemplateEmail("lead-alert", REVORA.email, {
        replyTo: data.email,
        templateData: {
          businessName: "Revora Growth Systems",
          kind: "New contact request",
          leadName: data.name,
          leadEmail: data.email,
          leadPhone: data.phone ?? "",
          service: data.interest ?? "",
          city: data.businessType ?? "",
          message: data.message,
        },
      });
      emailed = sent.sent === true;
    } catch (err) {
      console.error("contact email failed", err instanceof Error ? err.message : err);
    }

    return { ok: true as const, stored: true, emailed, throttled: false as const };
  });
