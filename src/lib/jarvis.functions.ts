/**
 * Jarvis — the platform owner's growth assistant. Super admin only, runs on
 * the free AI team (freeOnly), and grounds every answer in real platform
 * numbers and a live check of the primary website. One running conversation
 * per admin, stored in jarvis_messages.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyDb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const SITE = "https://revoragrowthsystems.com";

async function guard(context: { supabase: unknown; userId: unknown }) {
  const { assertSuperAdmin } = await import("@/lib/admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
}

export const getJarvisHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const db = context.supabase as unknown as AnyDb;
    const { data, error } = await db
      .from("jarvis_messages")
      .select("id,role,content,created_at")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error("Couldn't load your Jarvis chat.");
    return (data ?? []) as { id: string; role: "user" | "assistant"; content: string; created_at: string }[];
  });

export const clearJarvisHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const db = context.supabase as unknown as AnyDb;
    const { error } = await db.from("jarvis_messages").delete().eq("user_id", String(context.userId));
    if (error) throw new Error("Couldn't clear the chat.");
    return { ok: true };
  });

async function countRows(db: AnyDb, table: string, filter?: (q: any) => any): Promise<number | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

async function siteCheck(): Promise<string> {
  const lines: string[] = [];
  const get = async (path: string) => {
    try {
      const res = await fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(8000), redirect: "follow" });
      return { status: res.status, body: res.ok ? (await res.text()).slice(0, 60000) : "" };
    } catch {
      return { status: 0, body: "" };
    }
  };
  const [home, robots, sitemap] = await Promise.all([get("/"), get("/robots.txt"), get("/sitemap.xml")]);
  const pick = (re: RegExp) => home.body.match(re)?.[1]?.trim() ?? "missing";
  lines.push(`Homepage HTTP ${home.status || "unreachable"}`);
  lines.push(`Title: ${pick(/<title[^>]*>([^<]*)<\/title>/i)}`);
  lines.push(`Meta description: ${pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)}`);
  lines.push(`Canonical: ${pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i)}`);
  lines.push(`H1 count: ${(home.body.match(/<h1[\s>]/gi) ?? []).length}`);
  lines.push(`noindex on homepage: ${/name=["']robots["'][^>]+noindex/i.test(home.body)}`);
  lines.push(`robots.txt HTTP ${robots.status || "unreachable"}; mentions sitemap: ${/sitemap/i.test(robots.body)}; blocks all: ${/Disallow:\s*\/\s*$/im.test(robots.body)}`);
  lines.push(`sitemap.xml HTTP ${sitemap.status || "unreachable"}; URLs listed: ${(sitemap.body.match(/<loc>/g) ?? []).length}`);
  return lines.join("\n");
}

export const sendJarvisMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { message: string }) => {
    const message = String(input?.message ?? "").trim().slice(0, 4000);
    if (!message) throw new Error("Type a message first.");
    return { message };
  })
  .handler(async ({ context, data }) => {
    await guard(context);
    const userId = String(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyDb;

    const { error: insertError } = await admin.from("jarvis_messages").insert({ user_id: userId, role: "user", content: data.message });
    if (insertError) throw new Error("Couldn't save your message.");

    const { data: history } = await admin
      .from("jarvis_messages")
      .select("role,content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24);
    const turns = ((history ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [accounts, accountsWeek, trials, paid, leadsWeek, site] = await Promise.all([
      countRows(admin, "platform_accounts"),
      countRows(admin, "platform_accounts", (q) => q.gte("created_at", weekAgo)),
      countRows(admin, "platform_trials"),
      countRows(admin, "subscriptions", (q) => q.eq("status", "active")),
      countRows(admin, "leads", (q) => q.gte("created_at", weekAgo)),
      siteCheck(),
    ]);
    const n = (v: number | null) => (v === null ? "unavailable" : String(v));

    const system = [
      "You are Jarvis, the private growth assistant for the owner of Revora Growth Systems (primary site revoragrowthsystems.com), an AI website builder and customer-growth platform for businesses of any size and industry.",
      "Goal: help the owner win paying customers and get the site found on Google. Be direct, professional, proactive and specific. Give prioritized, actionable steps. Use markdown. Keep spoken-friendly answers concise unless asked for depth.",
      "Offer: $350 one-time setup, first month free, then $100/month, 3-day full-access trial.",
      "LIVE PLATFORM NUMBERS (real database counts):",
      `- Accounts created: ${n(accounts)} (last 7 days: ${n(accountsWeek)})`,
      `- Trials started: ${n(trials)}`,
      `- Paid customers (active subscriptions): ${n(paid)}`,
      `- Customer leads captured in the last 7 days: ${n(leadsWeek)}`,
      `LIVE SEO CHECK OF ${SITE} (fetched just now):`,
      site,
      "Rules: never invent numbers, reviews, testimonials, customers or results. If data is unavailable, say so. You cannot send emails, post, publish or change the site yourself — draft outreach emails, posts, ad copy and page text for the owner to approve and use. No phone numbers in marketing. Search rankings can't be guaranteed; explain Google Search Console steps (verify domain, submit sitemap, request indexing) when relevant.",
    ].join("\n");

    const { generateText } = await import("@/lib/ai/router.server");
    let reply: string;
    try {
      const result = await generateText(
        { userId, task: "admin.jarvis" },
        {
          role: "conversation",
          freeOnly: true,
          maxOutputTokens: 2500,
          messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role, content: t.content }))],
        },
      );
      reply = result.text.trim() || "I didn't get an answer back from the free AI team. Please try again.";
    } catch (error) {
      console.warn("jarvis free AI unavailable", error instanceof Error ? error.message : error);
      reply = "My free AI team is busy or out of quota right now. Please try again in a minute.";
    }

    await admin.from("jarvis_messages").insert({ user_id: userId, role: "assistant", content: reply.slice(0, 40000) });
    return { reply };
  });
