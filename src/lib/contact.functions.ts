import { createServerFn } from "@tanstack/react-start";
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
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Abuse guard: a single sender cannot flood the inbox.
    const windowStart = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("marketing_conversions")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "contact_submitted")
      .eq("email", data.email)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= 5) {
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
