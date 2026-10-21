/**
 * Free Growth Engine service layer. Every outside call (AI drafting, Reddit,
 * web search, Google Business Profile, email) lives here and reports failures
 * to the shared error log so they surface in admin Monitoring.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canSendEmail,
  canSendSms,
  capAllows,
  MANUAL_ONLY,
  postRelevance,
  RELEVANCE_THRESHOLD,
  riskFor,
  type ApprovalItemType,
} from "./rules";

type Db = SupabaseClient;

async function logFailure(message: string, context: Record<string, unknown>) {
  const { captureError } = await import("@/lib/monitoring.server");
  await captureError({ message, level: "error", route: "growth-engine", context });
}

const TRUTH_RULES =
  "Never invent reviews, ratings, prices, awards, certifications, years in business, guarantees or results. Use only facts given. Write plainly and helpfully.";

export async function draftJson(task: string, system: string, user: string): Promise<Record<string, unknown>> {
  const { generateStructuredOutput } = await import("@/lib/ai/router.server");
  try {
    const out = await generateStructuredOutput(
      { task: `growth.${task}` },
      {
        json: true,
        messages: [
          { role: "system", content: `${system}\n${TRUTH_RULES}\nAnswer with one JSON object only.` },
          { role: "user", content: user },
        ],
      },
    );
    return out.data;
  } catch (error) {
    await logFailure(`Growth drafting failed (${task})`, { error: String(error) });
    throw new Error("Jarvis couldn't draft this right now. Try again in a few minutes.");
  }
}

export async function enqueue(
  db: Db,
  input: { type: ApprovalItemType; itemId: string; summary: string; preview: string; negativeReview?: boolean },
) {
  const { data, error } = await db
    .from("approval_queue")
    .insert({
      item_type: input.type,
      item_id: input.itemId,
      module: input.type,
      summary: input.summary.slice(0, 200),
      preview: input.preview.slice(0, 4000),
      risk_level: riskFor(input.type, { negativeReview: input.negativeReview ?? false }),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("approval_item_versions").insert({ queue_id: data.id, version: 1, content: { preview: input.preview } });
  return data.id as string;
}

// ---- Reddit (public JSON search) ---------------------------------------------

export async function scanReddit(db: Db, niche: string, city: string) {
  const q = encodeURIComponent(`${niche} ${city}`);
  const res = await fetch(`https://www.reddit.com/search.json?q=${q}&sort=new&limit=25&t=month`, {
    headers: { "User-Agent": "RevoraGrowthEngine/1.0 (+https://revoragrowthsystems.com)" },
  });
  if (!res.ok) {
    await logFailure("Reddit search failed", { status: res.status });
    throw new Error(`Reddit search failed (${res.status}).`);
  }
  const json = (await res.json()) as {
    data?: { children?: { data: { title: string; selftext: string; permalink: string } }[] };
  };
  let added = 0;
  for (const c of json.data?.children ?? []) {
    const text = `${c.data.title}\n${c.data.selftext ?? ""}`;
    const relevance = postRelevance(text, niche, city);
    if (relevance < RELEVANCE_THRESHOLD) continue;
    const { error } = await db.from("qna_monitor").insert({
      source_platform: "reddit",
      post_url: `https://www.reddit.com${c.data.permalink}`,
      post_title: c.data.title.slice(0, 300),
      post_text: (c.data.selftext ?? "").slice(0, 3000),
      matched_niche: niche,
      relevance,
    });
    if (!error) added++;
  }
  return added;
}

export async function scanQuora(db: Db, niche: string, city: string) {
  const { searchWeb } = await import("@/lib/integrations/research.server");
  const outcome = await searchWeb(`site:quora.com ${niche} ${city} recommend`, 8);
  if (!outcome.ok) {
    await logFailure("Quora search failed", { reason: outcome.reason });
    throw new Error("Web search is unavailable right now.");
  }
  let added = 0;
  for (const r of outcome.results) {
    const text = `${r.title ?? ""}\n${r.snippet ?? ""}`;
    const relevance = postRelevance(text, niche, city);
    if (relevance < RELEVANCE_THRESHOLD || !r.source.url.includes("quora.com")) continue;
    const { error } = await db.from("qna_monitor").insert({
      source_platform: "quora",
      post_url: r.source.url,
      post_title: (r.title ?? "").slice(0, 300),
      post_text: (r.snippet ?? "").slice(0, 3000),
      matched_niche: niche,
      relevance,
    });
    if (!error) added++;
  }
  return added;
}

export async function searchEvents(db: Db, city: string, niche: string) {
  const { searchWeb } = await import("@/lib/integrations/research.server");
  const outcome = await searchWeb(`${city} small business expo OR community fair OR chamber event ${niche} 2026`, 8);
  if (!outcome.ok) throw new Error("Web search is unavailable right now.");
  let added = 0;
  for (const r of outcome.results) {
    const relevance = postRelevance(`${r.title} ${r.snippet}`, niche, city) || 30;
    const { error } = await db.from("local_events").insert({
      event_name: (r.title ?? r.source.url).slice(0, 200),
      url: r.source.url,
      location: city,
      relevance_score: Math.min(100, relevance),
      notes: (r.snippet ?? "").slice(0, 500),
    });
    if (!error) added++;
  }
  return added;
}

// ---- Google Business Profile ---------------------------------------------------

function gbpCreds() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_BUSINESS_PROFILE_API_KEY"];
  return lovable && conn ? { lovable, conn } : null;
}

export function gbpConnected() {
  return Boolean(gbpCreds());
}

async function gbpFetch(path: string, init: RequestInit = {}) {
  const c = gbpCreds();
  if (!c) throw new Error("Google Business Profile is not connected to the app.");
  const res = await fetch(`https://connector-gateway.lovable.dev/google_business_profile${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.lovable}`,
      "X-Connection-Api-Key": c.conn,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    await logFailure("Google Business Profile request failed", { status: res.status, body: body.slice(0, 400) });
    throw new Error(`Google Business Profile request failed [${res.status}]`);
  }
  return res.status === 204 ? {} : res.json();
}

// ---- Execution of approved items ------------------------------------------------

export type ExecuteOutcome = { status: "executed" | "approved" | "failed"; note: string };

export async function executeApproved(db: Db, item: { item_type: string; item_id: string }): Promise<ExecuteOutcome> {
  const type = item.item_type as ApprovalItemType;
  if (MANUAL_ONLY.has(type)) {
    return { status: "approved", note: "Approved. This one is yours to post or send by hand." };
  }
  const mailingAddress = process.env["REVORA_MAILING_ADDRESS"] ?? "";

  if (type === "blog" || type === "faq") {
    await db.from("content_drafts").update({ status: "approved" }).eq("id", item.item_id);
    return { status: "approved", note: "Approved and ready to add to your site." };
  }

  if (type === "social_post") {
    await db.from("social_posts").update({ status: "scheduled" }).eq("id", item.item_id);
    return { status: "approved", note: "Approved. Publish it from Jarvis → Instagram once Meta is connected." };
  }

  if (type === "gbp_post" || type === "review_reply") {
    const { data: draft } = await db.from("content_drafts").select("*").eq("id", item.item_id).single();
    if (!draft) return { status: "failed", note: "The draft no longer exists." };
    const target = (draft.extras as Record<string, string>)?.["gbp_path"];
    if (!gbpConnected() || !target) {
      await db.from("content_drafts").update({ status: "approved" }).eq("id", item.item_id);
      return { status: "approved", note: "Approved. Google profile isn't linked yet, so paste it in yourself." };
    }
    const { data: cap } = await db.from("growth_daily_caps").select("used").eq("platform", "gbp").eq("day", today()).maybeSingle();
    if (!capAllows("gbp", cap?.used ?? 0)) return { status: "approved", note: "Daily Google limit reached; try tomorrow." };
    try {
      if (type === "review_reply") {
        await gbpFetch(`/my_business/v4/${target}/reply`, { method: "PUT", body: JSON.stringify({ comment: draft.body }) });
      } else {
        await gbpFetch(`/my_business/v4/${target}/localPosts`, {
          method: "POST",
          body: JSON.stringify({ languageCode: "en", summary: draft.body, topicType: "STANDARD" }),
        });
      }
    } catch (e) {
      return { status: "failed", note: e instanceof Error ? e.message : "Google request failed." };
    }
    await bumpCap(db, "gbp", cap?.used ?? 0);
    await db.from("content_drafts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", item.item_id);
    return { status: "executed", note: "Published to Google." };
  }

  if (type === "review_request") {
    const { data: r } = await db.from("review_requests").select("*").eq("id", item.item_id).single();
    if (!r) return { status: "failed", note: "Request no longer exists." };
    if (r.channel === "sms") {
      const check = canSendSms({ phone: r.customer_phone, smsConsentAt: r.sms_consent_at, smsProviderConnected: Boolean(process.env["TWILIO_API_KEY"]) });
      if (!check.ok) return { status: "failed", note: check.reason };
      return { status: "failed", note: "Text sending isn't switched on yet." };
    }
    const check = canSendEmail({ email: r.customer_email, mailingAddress });
    if (!check.ok) return { status: "failed", note: check.reason };
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    try {
      const sent = await sendTemplateEmail("automation-message", r.customer_email!, {
        idempotencyKey: `review-request-${r.id}`,
        templateData: {
          businessName: "Revora Growth Systems",
          heading: "How did we do?",
          message: `Hi ${r.customer_name},\n\nThanks for working with Revora Growth Systems. If you have a minute, a short review helps other businesses find us:\n\n${r.review_link ?? ""}\n\nRevora Growth Systems · ${mailingAddress}`,
          signoff: "Revora Growth Systems",
        },
      });
      if (!sent.sent) return { status: "failed", note: "This person has unsubscribed." };
    } catch (e) {
      await logFailure("Review request email failed", { error: String(e) });
      return { status: "failed", note: "The email couldn't be sent." };
    }
    await db.from("review_requests").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
    return { status: "executed", note: "Review request emailed." };
  }

  if (type === "referral_invite") {
    const { data: r } = await db.from("referral_program").select("*").eq("id", item.item_id).single();
    if (!r?.consent_at) return { status: "failed", note: "No recorded opt-in for referral emails." };
    const check = canSendEmail({ email: r.referrer_email, mailingAddress });
    if (!check.ok) return { status: "failed", note: check.reason };
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    try {
      await sendTemplateEmail("automation-message", r.referrer_email!, {
        idempotencyKey: `referral-${r.id}`,
        templateData: {
          businessName: "Revora Growth Systems",
          heading: "Share Revora with a friend",
          message: `Hi ${r.referrer_name},\n\nKnow a business that needs a better website? Share your code ${r.code}.\n\nRevora Growth Systems · ${mailingAddress}`,
          signoff: "Revora Growth Systems",
        },
      });
    } catch (e) {
      await logFailure("Referral email failed", { error: String(e) });
      return { status: "failed", note: "The email couldn't be sent." };
    }
    return { status: "executed", note: "Referral invite emailed." };
  }

  return { status: "approved", note: "Approved." };
}

const today = () => new Date().toISOString().slice(0, 10);

async function bumpCap(db: Db, platform: string, used: number) {
  await db.from("growth_daily_caps").upsert({ platform, day: today(), used: used + 1 });
}
