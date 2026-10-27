import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Every Growth Engine call is super-admin only; RLS enforces the same. */

async function guard(context: { supabase: unknown; userId: string }) {
  const { assertSuperAdmin } = await import("@/lib/admin.server");
  // The auth middleware always supplies the user-scoped client; `unknown` is
  // only how the middleware context types it.
  const supabase = context.supabase as Parameters<typeof assertSuperAdmin>[0];
  await assertSuperAdmin(supabase, context.userId);
  return supabase;
}

const svc = () => import("@/lib/growth-engine/service.server");
const rules = () => import("@/lib/growth-engine/rules");

// ---------------- Overview ----------------

export const getGrowthOverview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { healthScore } = await rules();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const next7 = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [biz, pending, gbp, reviews30, content30, dirs, wins, upcoming, social] = await Promise.all([
    db.from("growth_businesses").select("*").order("created_at").limit(1).maybeSingle(),
    db.from("approval_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("gbp_profiles").select("optimization_score").limit(1).maybeSingle(),
    db.from("review_requests").select("id", { count: "exact", head: true }).eq("review_left", true).gte("created_at", since30),
    db.from("content_drafts").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since30),
    db.from("directory_listings").select("status"),
    db.from("approval_queue").select("item_type, executed_at").eq("status", "executed").gte("executed_at", since7),
    db.from("content_drafts").select("id, type, title, scheduled_for, status").gte("scheduled_for", new Date().toISOString()).lte("scheduled_for", next7).order("scheduled_for"),
    db.from("social_posts").select("id, caption, scheduled_for, status").gte("scheduled_for", new Date().toISOString()).lte("scheduled_for", next7).order("scheduled_for"),
  ]);
  const dirRows = (dirs.data ?? []) as { status: string }[];
  const live = dirRows.filter((d) => d.status === "live").length;
  return {
    business: biz.data ?? null,
    pendingCount: pending.count ?? 0,
    gbpScore: gbp.data?.optimization_score ?? null,
    health: healthScore({
      gbpScore: gbp.data?.optimization_score ?? null,
      reviewsLast30: reviews30.count ?? 0,
      contentPublishedLast30: content30.count ?? 0,
      directoriesLive: live,
      directoriesTotal: dirRows.length,
    }),
    winsThisWeek: (wins.data ?? []).length,
    directoriesLive: live,
    directoriesTotal: dirRows.length,
    upcoming: [
      ...(upcoming.data ?? []).map((c: { id: string; type: string; title: string | null; scheduled_for: string }) => ({ id: c.id, label: c.title ?? c.type, kind: c.type, at: c.scheduled_for })),
      ...(social.data ?? []).map((s: { id: string; caption: string; scheduled_for: string }) => ({ id: s.id, label: s.caption.slice(0, 80), kind: "social", at: s.scheduled_for })),
    ],
    gbpConnected: (await svc()).gbpConnected(),
    smsConnected: Boolean(process.env["TWILIO_API_KEY"]),
  };
});

const businessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  niche: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  service_area: z.string().trim().max(200).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  website_url: z.string().trim().max(200).optional().default(""),
});

export const saveGrowthBusiness = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => businessSchema.parse(d)).handler(async ({ data, context }) => {
  const db = await guard(context);
  const { data: existing } = await db.from("growth_businesses").select("id").order("created_at").limit(1).maybeSingle();
  const row = { ...data, website_status: data.website_url ? "active" : "none" };
  const q = existing ? db.from("growth_businesses").update(row).eq("id", existing.id) : db.from("growth_businesses").insert(row);
  const { error } = await q;
  if (error) throw new Error(error.message);
  return { ok: true };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function business(db: { from: (t: string) => any }) {
  const { data } = await db.from("growth_businesses").select("*").order("created_at").limit(1).maybeSingle();
  if (!data) throw new Error("Add your business details first (Home tab).");
  return data as { id: string; name: string; niche: string | null; city: string | null; address: string | null; phone: string | null; website_url: string | null };
}

// ---------------- Approval queue ----------------

export const listApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.enum(["pending", "approved", "executed", "rejected", "failed", "all"]).default("pending") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    let q = db.from("approval_queue").select("*").order("created_at", { ascending: false }).limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows as {
      id: string; item_type: string; summary: string; preview: string | null; risk_level: string; status: string;
      created_at: string; execution_note: string | null; rejected_reason: string | null;
    }[];
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().max(300).optional(),
    /** Fingerprint of the content the reviewer saw; when sent, an item that changed since is refused. */
    seenHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const now = new Date().toISOString();
    if (data.decision === "reject") {
      const { error } = await db.from("approval_queue").update({ status: "rejected", rejected_reason: data.reason ?? null, approved_by: context.userId, approved_at: now }).eq("id", data.id).eq("status", "pending");
      if (error) throw new Error(error.message);
      return { status: "rejected", note: "Rejected." };
    }
    // Approve exactly what was shown: compare against the stored item, then pin the claim to that content.
    let seen: { summary: string; preview: string | null } | null = null;
    if (data.seenHash) {
      const { data: current } = await db.from("approval_queue").select("id, item_type, summary, preview").eq("id", data.id).maybeSingle();
      if (!current) throw new Error("Item not found.");
      const { approvalMatchesSeen } = await import("@/lib/cognition/approval-token");
      if (!(await approvalMatchesSeen(current, data.seenHash))) throw new Error("This item changed after you opened it. Review the new version, then approve again.");
      seen = { summary: current.summary, preview: current.preview };
    }
    // Claim exactly once: only a pending row can move forward.
    let claim = db.from("approval_queue").update({ status: "approved", approved_by: context.userId, approved_at: now }).eq("id", data.id).eq("status", "pending");
    if (seen) claim = (seen.preview === null ? claim.is("preview", null) : claim.eq("preview", seen.preview)).eq("summary", seen.summary);
    const { data: claimed, error } = await claim.select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!claimed) throw new Error(seen ? "This item was already handled or changed after you opened it." : "This item was already handled.");
    const outcome = await (await svc()).executeApproved(db, claimed);
    await db.from("approval_queue").update({ status: outcome.status, execution_note: outcome.note, executed_at: outcome.status === "executed" ? new Date().toISOString() : null }).eq("id", data.id);
    return outcome;
  });

export const editApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), preview: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const { statusAfterEdit } = await rules();
    const { data: item } = await db.from("approval_queue").select("*").eq("id", data.id).single();
    if (!item) throw new Error("Item not found.");
    const { data: versions } = await db.from("approval_item_versions").select("version").eq("queue_id", data.id).order("version", { ascending: false }).limit(1);
    const next = (versions?.[0]?.version ?? 0) + 1;
    await db.from("approval_item_versions").insert({ queue_id: data.id, version: next, content: { preview: data.preview }, edited_by: context.userId });
    await db.from("approval_queue").update({ preview: data.preview, status: statusAfterEdit(item.status), execution_note: next > 1 ? "Edited — needs approval again." : null }).eq("id", data.id);
    // Keep the underlying draft text in step with the edit.
    const table = ["blog", "faq", "gbp_post", "review_reply"].includes(item.item_type) ? "content_drafts" : item.item_type === "social_post" ? "social_posts" : item.item_type === "qna_reply" ? "qna_monitor" : item.item_type === "partnership_pitch" ? "partnership_leads" : null;
    const column = table === "content_drafts" ? "body" : table === "social_posts" ? "caption" : table === "qna_monitor" ? "draft_reply" : table === "partnership_leads" ? "pitch_draft" : null;
    if (table && column) await db.from(table).update({ [column]: data.preview }).eq("id", item.item_id);
    return { version: next };
  });

export const approvalHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const { data: rows } = await db.from("approval_item_versions").select("version, content, created_at").eq("queue_id", data.id).order("version", { ascending: false });
    return (rows ?? []) as { version: number; content: { preview: string }; created_at: string }[];
  });

// ---------------- Google profile ----------------

const gbpSchema = z.object({
  category: z.string().max(100).optional().default(""),
  hasHours: z.boolean(), hasBookingLink: z.boolean(), hasDescription: z.boolean(),
  photosCount: z.number().int().min(0).max(10000), lastPhotoDate: z.string().optional().default(""),
  postsCount: z.number().int().min(0).max(10000), lastPostDate: z.string().optional().default(""),
  reviewsCount: z.number().int().min(0).max(100000), avgRating: z.number().min(0).max(5).nullable(),
  profileUrl: z.string().max(300).optional().default(""),
});

export const auditGbp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => gbpSchema.parse(d)).handler(async ({ data, context }) => {
  const db = await guard(context);
  const b = await business(db);
  const { gbpScore } = await rules();
  const result = gbpScore({ ...data, lastPhotoDate: data.lastPhotoDate || null, lastPostDate: data.lastPostDate || null });
  const { error } = await db.from("gbp_profiles").upsert({
    business_id: b.id, profile_url: data.profileUrl || null, category: data.category || null, hours: data.hasHours ? { set: true } : null,
    photos_count: data.photosCount, posts_count: data.postsCount, reviews_count: data.reviewsCount, avg_rating: data.avgRating,
    last_post_date: data.lastPostDate || null, last_photo_date: data.lastPhotoDate || null, has_booking_link: data.hasBookingLink,
    has_description: data.hasDescription, optimization_score: result.score, fix_list: result.fixes, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return result;
});

export const getGbp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("gbp_profiles").select("*").limit(1).maybeSingle();
  return data ?? null;
});

export const draftGbpPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    const out = await s.draftJson("gbp_post", "You write short Google Business Profile posts (under 1200 characters) with one clear call to action.", `Business: ${b.name} (${b.niche ?? ""}, ${b.city ?? ""}). Topic: ${data.topic}. Return {"body": string}.`);
    const body = String(out["body"] ?? "").slice(0, 1500);
    if (!body) throw new Error("Jarvis returned an empty draft.");
    const { data: row, error } = await db.from("content_drafts").insert({ business_id: b.id, type: "gbp_post", title: data.topic, body, scheduled_for: new Date(Date.now() + 86_400_000).toISOString() }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: "gbp_post", itemId: row.id, summary: `Google post: ${data.topic}`, preview: body });
    return { ok: true };
  });

export const draftReviewReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reviewer: z.string().max(80), rating: z.number().int().min(1).max(5), text: z.string().max(3000), gbpPath: z.string().max(300).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    const negative = data.rating <= 3;
    const out = await s.draftJson("review_reply", negative ? "Write a calm, sincere apology and offer to make it right offline. No excuses, no admissions of legal fault, under 600 characters." : "Write a warm, specific thank-you under 400 characters.", `Business: ${b.name}. Reviewer: ${data.reviewer}. Rating: ${data.rating}/5. Review: ${data.text}. Return {"body": string}.`);
    const body = String(out["body"] ?? "").slice(0, 1000);
    if (!body) throw new Error("Jarvis returned an empty draft.");
    const { data: row, error } = await db.from("content_drafts").insert({ business_id: b.id, type: "review_reply", title: `Reply to ${data.reviewer} (${data.rating}★)`, body, extras: { review: data.text, rating: data.rating, gbp_path: data.gbpPath || null } }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: "review_reply", itemId: row.id, summary: `Reply to ${data.reviewer} (${data.rating}★)`, preview: body, negativeReview: negative });
    return { ok: true };
  });

// ---------------- Directories ----------------

export const listDirectories = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("directory_listings").select("*").order("directory_name");
  return (data ?? []) as { id: string; directory_name: string; status: string; url: string | null; listed_name: string | null; listed_address: string | null; listed_phone: string | null }[];
});

export const buildDirectoryPackages = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const b = await business(db);
  const { directoriesFor, napReady } = await rules();
  const missing = napReady(b);
  if (missing.length) throw new Error(`Add your business ${missing.join(", ")} first — every listing must match exactly.`);
  const pkg = { name: b.name, address: b.address, phone: b.phone, website: b.website_url, category: b.niche };
  const rows = directoriesFor(b.niche).map((directory_name) => ({ business_id: b.id, directory_name, package: pkg }));
  const { error } = await db.from("directory_listings").upsert(rows, { onConflict: "business_id,directory_name", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return { count: rows.length };
});

export const updateDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["pending", "submitted", "live", "rejected", "needs_update"]), url: z.string().max(300).optional(), listedName: z.string().max(120).optional(), listedAddress: z.string().max(200).optional(), listedPhone: z.string().max(30).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const { napMismatches, napReady } = await rules();
    if (data.status === "submitted" && napReady(b).length) throw new Error("Your name, address and phone must be complete before submitting.");
    const mismatches = napMismatches(b as { name: string }, { name: data.listedName ?? null, address: data.listedAddress ?? null, phone: data.listedPhone ?? null });
    const status = mismatches.length && data.status === "live" ? "needs_update" : data.status;
    const { error } = await db.from("directory_listings").update({ status, url: data.url || null, listed_name: data.listedName ?? null, listed_address: data.listedAddress ?? null, listed_phone: data.listedPhone ?? null, submitted_at: data.status === "submitted" ? new Date().toISOString() : undefined }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { status, mismatches };
  });

// ---------------- Content ----------------

export const listContent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("content_drafts").select("id, type, title, meta_description, status, scheduled_for, created_at").in("type", ["blog", "faq"]).order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as { id: string; type: string; title: string | null; meta_description: string | null; status: string; scheduled_for: string | null }[];
});

export const draftContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ type: z.enum(["blog", "faq"]), keyword: z.string().trim().min(3).max(150) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    const out = await s.draftJson(
      data.type,
      data.type === "blog"
        ? "You are an SEO writer. Write a 600-1000 word local article in markdown. Do not state prices unless given."
        : "Write a markdown FAQ with 6-8 real-sounding customer questions and honest answers. Do not state prices unless given.",
      `Business: ${b.name}, ${b.niche ?? ""} in ${b.city ?? ""}. Site: ${b.website_url ?? ""}. Target keyword: ${data.keyword}. Return {"title": string, "meta_description": string (<=155 chars), "body": string, "internal_links": string[], "image_alt": string[]}.`,
    );
    const body = String(out["body"] ?? "");
    if (body.length < 200) throw new Error("Jarvis returned a draft that was too short. Try again.");
    const title = String(out["title"] ?? data.keyword).slice(0, 160);
    const { data: row, error } = await db.from("content_drafts").insert({
      business_id: b.id, type: data.type, title, meta_description: String(out["meta_description"] ?? "").slice(0, 160), body,
      extras: { keyword: data.keyword, internal_links: out["internal_links"] ?? [], image_alt: out["image_alt"] ?? [] },
      scheduled_for: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: data.type, itemId: row.id, summary: `${data.type === "blog" ? "Blog" : "FAQ"}: ${title}`, preview: body });
    return { ok: true };
  });

// ---------------- Review requests ----------------

export const listReviewRequests = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("review_requests").select("*").order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as { id: string; customer_name: string; channel: string; sent_at: string | null; reminder_sent_at: string | null; clicked: boolean; review_left: boolean }[];
});

export const createReviewRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().max(120).optional().default(""), phone: z.string().trim().max(30).optional().default(""), channel: z.enum(["email", "sms"]), smsOptIn: z.boolean(), reviewLink: z.string().url().max(400), jobId: z.string().max(80).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    if (data.channel === "sms" && !data.smsOptIn) throw new Error("Texts need the customer's recorded opt-in.");
    const now = new Date().toISOString();
    const { data: row, error } = await db.from("review_requests").insert({ business_id: b.id, customer_name: data.name, customer_email: data.email || null, customer_phone: data.phone || null, channel: data.channel, sms_consent_at: data.smsOptIn ? now : null, email_consent_at: data.channel === "email" ? now : null, review_link: data.reviewLink, job_id: data.jobId || null }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: "review_request", itemId: row.id, summary: `Review request to ${data.name} by ${data.channel}`, preview: `Ask ${data.name} for a review: ${data.reviewLink}` });
    return { ok: true };
  });

export const markReviewRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), field: z.enum(["clicked", "review_left"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    await db.from("review_requests").update({ [data.field]: true }).eq("id", data.id);
    return { ok: true };
  });

// ---------------- Reddit & Quora ----------------

export const listQna = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("qna_monitor").select("*").in("status", ["new", "drafted", "approved"]).order("relevance", { ascending: false }).limit(50);
  const { DAILY_REPLY_CAP } = await rules();
  return { rows: (data ?? []) as { id: string; source_platform: string; post_url: string; post_title: string | null; relevance: number; status: string; draft_reply: string | null }[], caps: DAILY_REPLY_CAP };
});

export const scanQna = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const b = await business(db);
  if (!b.niche || !b.city) throw new Error("Add your niche and city first.");
  const s = await svc();
  const [reddit, quora] = await Promise.allSettled([s.scanReddit(db, b.niche, b.city), s.scanQuora(db, b.niche, b.city)]);
  return {
    reddit: reddit.status === "fulfilled" ? reddit.value : null,
    quora: quora.status === "fulfilled" ? quora.value : null,
    errors: [reddit, quora].filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason?.message ?? r)),
  };
});

export const draftQnaReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    const { capAllows } = await rules();
    const { data: post } = await db.from("qna_monitor").select("*").eq("id", data.id).single();
    if (!post) throw new Error("Post not found.");
    const { count } = await db.from("approval_queue").select("id", { count: "exact", head: true }).eq("item_type", "qna_reply").gte("created_at", new Date().toISOString().slice(0, 10));
    if (!capAllows(post.source_platform, count ?? 0)) throw new Error(`Daily ${post.source_platform} reply limit reached — try tomorrow.`);
    const out = await s.draftJson("qna_reply", "Write a genuinely helpful forum reply (under 120 words). Answer the question first; mention the business once, naturally, with disclosure that you're affiliated. No hard sell.", `Post: ${post.post_title}\n${post.post_text}\nBusiness: ${b.name} (${b.niche}, ${b.city}). Return {"reply": string}.`);
    const reply = String(out["reply"] ?? "").slice(0, 1500);
    await db.from("qna_monitor").update({ draft_reply: reply, status: "drafted" }).eq("id", data.id);
    await s.enqueue(db, { type: "qna_reply", itemId: data.id, summary: `${post.source_platform} reply: ${post.post_title ?? ""}`, preview: `${reply}\n\nPost: ${post.post_url}` });
    return { ok: true };
  });

export const setQnaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["posted", "skipped"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    await db.from("qna_monitor").update({ status: data.status, posted_at: data.status === "posted" ? new Date().toISOString() : null }).eq("id", data.id);
    return { ok: true };
  });

// ---------------- Referrals ----------------

export const listReferrals = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("referral_program").select("*").order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as { id: string; referrer_name: string; code: string; status: string; reward_value: number | null }[];
});

export const createReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80), email: z.string().email().max(120), optIn: z.literal(true), reward: z.number().min(0).max(10000).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const s = await svc();
    const code = `${data.name.replace(/[^a-z]/gi, "").slice(0, 6).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: row, error } = await db.from("referral_program").insert({ referrer_name: data.name, referrer_email: data.email, code, reward_value: data.reward, consent_at: new Date().toISOString() }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: "referral_invite", itemId: row.id, summary: `Referral invite to ${data.name}`, preview: `Invite ${data.name} to share code ${code}.` });
    return { code };
  });

export const setReferralStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["shared", "redeemed", "closed", "expired"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    await db.from("referral_program").update({ status: data.status }).eq("id", data.id);
    return { ok: true };
  });

// ---------------- Partnerships ----------------

export const listPartners = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const b = await business(db).catch(() => null);
  const { partnerTypesFor } = await rules();
  const { data } = await db.from("partnership_leads").select("*").order("created_at", { ascending: false }).limit(100);
  return { suggestions: partnerTypesFor(b?.niche), rows: (data ?? []) as { id: string; business_name: string; business_type: string | null; contact_email: string | null; pitch_draft: string | null; status: string }[] };
});

export const addPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(120), type: z.string().trim().max(80), email: z.string().trim().max(120).optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    const out = await s.draftJson("partnership_pitch", "Draft a short, friendly cross-referral pitch email (under 150 words) the owner will personalize and send by hand.", `From: ${b.name} (${b.niche}, ${b.city}). To: ${data.name}, a ${data.type}. Return {"pitch": string}.`);
    const pitch = String(out["pitch"] ?? "").slice(0, 2000);
    const { data: row, error } = await db.from("partnership_leads").insert({ business_name: data.name, business_type: data.type, contact_email: data.email || null, pitch_draft: pitch, status: "drafted" }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: "partnership_pitch", itemId: row.id, summary: `Pitch to ${data.name}`, preview: pitch });
    return { ok: true };
  });

export const setPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["sent", "responded"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    await db.from("partnership_leads").update({ status: data.status }).eq("id", data.id);
    return { ok: true };
  });

// ---------------- Social ----------------

export const listSocial = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("social_posts").select("*").order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as { id: string; caption: string; status: string; scheduled_for: string | null; engagement_metrics: Record<string, number> }[];
});

export const draftSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ idea: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    const b = await business(db);
    const s = await svc();
    const out = await s.draftJson("social_post", "Write an Instagram caption under 600 characters with up to 5 relevant hashtags.", `Business: ${b.name} (${b.niche}, ${b.city}). Idea: ${data.idea}. Return {"caption": string}.`);
    const caption = String(out["caption"] ?? "").slice(0, 2200);
    const { data: row, error } = await db.from("social_posts").insert({ caption, scheduled_for: new Date(Date.now() + 2 * 86_400_000).toISOString() }).select("id").single();
    if (error) throw new Error(error.message);
    await s.enqueue(db, { type: "social_post", itemId: row.id, summary: `Instagram: ${data.idea}`, preview: caption });
    return { ok: true };
  });

// ---------------- Events ----------------

export const listEvents = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const { data } = await db.from("local_events").select("*").neq("status", "skipped").order("relevance_score", { ascending: false }).limit(50);
  return (data ?? []) as { id: string; event_name: string; url: string | null; relevance_score: number; notes: string | null; status: string }[];
});

export const scanEvents = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await guard(context);
  const b = await business(db);
  if (!b.city) throw new Error("Add your city first.");
  return { added: await (await svc()).searchEvents(db, b.city, b.niche ?? "") };
});

export const setEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["reviewed", "attending", "skipped"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await guard(context);
    await db.from("local_events").update({ status: data.status }).eq("id", data.id);
    return { ok: true };
  });
