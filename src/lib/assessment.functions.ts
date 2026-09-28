import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { scoreAssessment, type AssessmentAnswers } from "@/lib/assessment";

/**
 * Free Growth Assessment / Website Audit lead capture.
 *
 * Public by design (it is a marketing lead magnet), but every field is
 * normalized and length-capped before it touches the database, and only the
 * assessment's own inputs are stored.
 */

const text = (value: unknown, max: number) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw.slice(0, max) : "";
};

const num = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const bool = (value: unknown) => value === true;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Abuse limits: this endpoint sends email to whatever address is entered. */
const EMAIL_LIMIT_PER_DAY = 3;
const IP_LIMIT_PER_HOUR = 10;

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

const SPEEDS: AssessmentAnswers["replySpeed"][] = ["minutes", "hours", "same_day", "days"];

export interface AssessmentSubmission {
  answers: AssessmentAnswers;
  /** Which funnel produced the lead. */
  source?: "growth_assessment" | "website_audit";
  websiteUrl?: string | null;
  sessionId?: string | null;
  landingPath?: string | null;
}

export const submitAssessment = createServerFn({ method: "POST" })
  .validator((input: AssessmentSubmission) => {
    const a = input?.answers ?? ({} as AssessmentAnswers);
    const email = text(a.email, 160);
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email so we can send your results.");
    const speed = SPEEDS.includes(a.replySpeed) ? a.replySpeed : "hours";
    return {
      source: input?.source === "website_audit" ? "website_audit" : "growth_assessment",
      websiteUrl: text(input?.websiteUrl, 300) || null,
      sessionId: text(input?.sessionId, 60) || null,
      landingPath: text(input?.landingPath, 200) || null,
      answers: {
        businessName: text(a.businessName, 120),
        industry: text(a.industry, 80),
        email,
        leadsPerMonth: num(a.leadsPerMonth, 0, 5000, 0),
        averageJobValue: num(a.averageJobValue, 0, 500_000, 0),
        closeRate: num(a.closeRate, 1, 100, 20),
        replySpeed: speed,
        hasWebsite: bool(a.hasWebsite),
        hasOnlineBooking: bool(a.hasOnlineBooking),
        hasInstantQuote: bool(a.hasInstantQuote),
        hasCrm: bool(a.hasCrm),
        hasAutomatedFollowUp: bool(a.hasAutomatedFollowUp),
        hasReviewRequests: bool(a.hasReviewRequests),
        hasLocalSeo: bool(a.hasLocalSeo),
        tracksLeadSources: bool(a.tracksLeadSources),
      } satisfies AssessmentAnswers,
    };
  })
  .handler(async ({ data }) => {
    const result = scoreAssessment(data.answers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Abuse guard. The visitor always gets their on-screen results, but a
    // single address or connection cannot be used to mass-send report emails
    // from Revora's domain (which would damage sender reputation).
    const ip = clientIp();
    const ipHash = ip ? await sha256Hex(`assessment|${ip}`) : null;
    const events = ["assessment_submitted", "audit_requested"];
    const [byEmail, byIp] = await Promise.all([
      supabaseAdmin
        .from("marketing_conversions")
        .select("id", { count: "exact", head: true })
        .in("event_name", events)
        .eq("email", data.answers.email)
        .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()),
      ipHash
        ? supabaseAdmin
            .from("marketing_conversions")
            .select("id", { count: "exact", head: true })
            .in("event_name", events)
            .contains("metadata", { ip_hash: ipHash })
            .gte("created_at", new Date(Date.now() - 3_600_000).toISOString())
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (byEmail.error || byIp.error) {
      console.error("submitAssessment rate check failed", (byEmail.error ?? byIp.error)?.message);
    }
    if ((byEmail.count ?? 0) >= EMAIL_LIMIT_PER_DAY || (byIp.count ?? 0) >= IP_LIMIT_PER_HOUR) {
      return { ok: true, emailed: false, throttled: true, result };
    }

    const { error } = await supabaseAdmin.from("marketing_conversions").insert({
      event_name: data.source === "website_audit" ? "audit_requested" : "assessment_submitted",
      landing_path: data.landingPath,
      industry_slug: data.answers.industry
        ? data.answers.industry.toLowerCase().slice(0, 80)
        : null,
      session_id: data.sessionId,
      email: data.answers.email,
      amount_cents: Math.min(result.missedRevenueMonthly, 2_000_000) * 100,
      metadata: {
        source: data.source,
        business: data.answers.businessName,
        website: data.websiteUrl ?? "",
        score: result.score,
        band: result.band,
        gaps: result.gaps.length,
        leakage_percent: result.leakagePercent,
        ...(ipHash ? { ip_hash: ipHash } : {}),
      } as never,
    });
    if (error) console.error("submitAssessment insert failed", error.message);

    // Nurture: email the results so the lead has the report even if they leave.
    let emailed = false;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const sent = await sendTemplateEmail("growth-assessment", data.answers.email, {
        idempotencyKey: `assessment:${data.answers.email}:${result.score}:${data.source}`,
        templateData: {
          businessName: data.answers.businessName || "your business",
          score: result.score,
          band: result.band,
          headline: result.headline,
          missedRevenueMonthly: result.missedRevenueMonthly,
          gaps: result.gaps.slice(0, 5).map((g) => ({ title: g.title, fix: g.fix })),
        },
      });
      emailed = sent.sent === true;
    } catch (err) {
      console.error("assessment email failed", err instanceof Error ? err.message : err);
    }

    return { ok: true, emailed, result };
  });
