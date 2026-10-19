import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseProspectDemoInput } from "./jarvis-demo-site";

async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/**
 * Super-admin only: builds a private demo website for a business that has no
 * website yet. Creates a demo workspace, queues the normal AI first build and
 * returns a 30-day private preview link. Nothing is published or sent.
 */
export const startProspectDemoBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => parseProspectDemoInput(input))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { provisionProspectDemo } = await import("./jarvis-demo-site.server");
    const result = await provisionProspectDemo(db, data, String(context.userId));

    const origin = new URL(getRequest().url).origin;
    const { runInBackground } = await import("@/lib/background");
    const { kickWorker } = await import("@/lib/site-engine.functions");
    runInBackground(() => kickWorker(origin, result.organizationId));

    return { ...result, previewPath: `/p/${result.previewToken}` };
  });

export const listProspectDemoBuilds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { listProspectDemos } = await import("./jarvis-demo-site.server");
    return listProspectDemos(db);
  });

export type { DemoOutreachDraft } from "./prospect-outreach.server";
import type { DemoOutreachDraft } from "./prospect-outreach.server";

function appBase(): string {
  return (process.env["APP_URL"] ?? new URL(getRequest().url).origin).replace(/\/$/, "");
}

/**
 * Super-admin only: writes the outreach email for a finished demo with the
 * free AI team. Returns a draft; sending is a separate, explicit action.
 */
export const draftDemoOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId?: unknown }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid demo");
    return { organizationId };
  })
  .handler(async ({ context, data }): Promise<DemoOutreachDraft> => {
    const db = await guardedAdmin(context);
    const { draftDemoEmail } = await import("./prospect-outreach.server");
    return draftDemoEmail(db, data.organizationId, appBase());
  });

/** Super-admin only: sends the demo email from the connected Gmail (one per business, opt-outs respected). */
export const sendDemoOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId?: unknown; to?: unknown; subject?: unknown; body?: unknown }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid demo");
    const subject = typeof input?.subject === "string" ? input.subject.trim().slice(0, 200) : "";
    const body = typeof input?.body === "string" ? input.body.trim().slice(0, 4000) : "";
    if (!subject || !body) throw new Error("Write a subject and message first.");
    return { organizationId, to: String(input?.to ?? ""), subject, body };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { sendDemoEmail, withLegalFooter } = await import("./prospect-outreach.server");
    return sendDemoEmail(db, { ...data, body: await withLegalFooter(data.body), source: "manual", dailyCap: 40 });
  });

export type OutreachAutopilot = {
  enabled: boolean;
  targets: { niche: string; city: string; state: string }[];
  dailyCap: number;
  lastRunAt: string | null;
  lastResult: Record<string, unknown> | null;
  sentToday: number;
  recent: { email: string; status: string; source: string; createdAt: string; error: string | null }[];
};

/** Super-admin only: the outreach autopilot switch, targets and recent sends. */
export const getOutreachAutopilot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OutreachAutopilot> => {
    const db = await guardedAdmin(context);
    const { readAutopilot } = await import("./prospect-outreach.server");
    return readAutopilot(db);
  });

export const saveOutreachAutopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { enabled?: unknown; targets?: unknown; dailyCap?: unknown }) => {
    const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
    const targets = (Array.isArray(input?.targets) ? input.targets : [])
      .slice(0, 10)
      .map((t: { niche?: unknown; city?: unknown; state?: unknown }) => ({ niche: clean(t?.niche, 80), city: clean(t?.city, 80), state: clean(t?.state, 40) }))
      .filter((t) => t.niche.length >= 3 && t.city.length >= 2);
    const dailyCap = Math.max(1, Math.min(40, Math.floor(Number(input?.dailyCap ?? 40)) || 40));
    return { enabled: input?.enabled === true, targets, dailyCap };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { error } = await db
      .from("prospect_outreach_autopilot")
      .update({ enabled: data.enabled, targets: data.targets, daily_cap: data.dailyCap, owner_id: String(context.userId), updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      organization_id: null,
      actor_id: String(context.userId),
      action: data.enabled ? "jarvis.outreach_autopilot.on" : "jarvis.outreach_autopilot.off",
      entity: "prospect_outreach_autopilot",
      entity_id: null,
      metadata: { targets: data.targets.length, daily_cap: data.dailyCap },
    });
    return { ok: true };
  });

/** Super-admin only: runs one autopilot pass now (same rules and cap as the schedule). */
export const runOutreachAutopilotNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { runOutreachAutopilot } = await import("./prospect-outreach.server");
    return runOutreachAutopilot(db, appBase(), { force: true });
  });

/**
 * Super-admin only: finds businesses in a niche and city that have no real
 * website (none, or only a social/directory page) on Google Places, skipping
 * ones that already have a demo. Read-only; capped per day to bound cost.
 */
export const findProspectsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { niche?: unknown; city?: unknown; state?: unknown }) => {
    const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
    const niche = clean(input?.niche, 80);
    const city = clean(input?.city, 80);
    const state = clean(input?.state, 40);
    if (niche.length < 3) throw new Error("Enter the kind of business to look for, like \"mobile detailing\".");
    if (city.length < 2) throw new Error("Enter the city to search.");
    return { niche, city, state };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { findProspects } = await import("./jarvis-demo-site.server");
    return findProspects(db, String(context.userId), data);
  });

/**
 * Super-admin only: prefills the demo form from a Google Maps link (or
 * "name, city" text). Read-only; shares the prospect finder's daily budget.
 */
export const prospectFromMapsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { input?: unknown }) => {
    const value = typeof input?.input === "string" ? input.input.trim().slice(0, 2000) : "";
    if (value.length < 3) throw new Error("Paste a Google Maps link, or type the business name and city.");
    return { input: value };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { prospectFromMaps } = await import("./jarvis-demo-site.server");
    return prospectFromMaps(db, String(context.userId), data.input);
  });

/**
 * Super-admin only: prefills the demo form from a picture (Maps screenshot,
 * business card, flyer, sign) using a free vision model. The picture is not
 * stored.
 */
export const prospectFromImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { dataUrl?: unknown }) => {
    const dataUrl = typeof input?.dataUrl === "string" ? input.dataUrl : "";
    if (!dataUrl.startsWith("data:image/")) throw new Error("Choose a picture first.");
    if (dataUrl.length > 6_000_000) throw new Error("That picture is too large. Use one under 4 MB.");
    return { dataUrl };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { prospectFromImage } = await import("./jarvis-demo-site.server");
    return prospectFromImage(db, String(context.userId), data.dataUrl);
  });
