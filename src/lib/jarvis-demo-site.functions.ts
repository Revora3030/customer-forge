import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseProspectDemoInput } from "./jarvis-demo-site";
import type { DemoStatus, OutreachChannel, OutreachResult } from "./prospect-outreach.server";

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

export type DemoOutreachDraft = {
  email: string | null;
  subject: string;
  body: string;
  previewUrl: string;
  mailingAddressConfigured: boolean;
  aiWritten: boolean;
};

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseOrganizationId = (input: { organizationId?: unknown } | undefined) => {
  const organizationId = String(input?.organizationId ?? "");
  if (!ORG_ID.test(organizationId)) throw new Error("Invalid demo");
  return { organizationId };
};

/**
 * Super-admin only: writes the outreach email for a finished demo with the AI
 * free pool, for the operator to review. Nothing is sent from here; sending
 * goes through sendDemoOutreachFn and its safeguards.
 */
export const draftDemoOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseOrganizationId)
  .handler(async ({ context, data }): Promise<DemoOutreachDraft> => {
    const db = await guardedAdmin(context);
    const { draftDemoOutreachText } = await import("./prospect-outreach.server");
    const draft = await draftDemoOutreachText(db, data.organizationId, {
      actorId: String(context.userId),
      origin: new URL(getRequest().url).origin,
    });
    const { outreachFooter } = await import("./jarvis-prospecting.functions");
    const { address, footer } = outreachFooter();
    return {
      email: draft.email,
      subject: draft.subject,
      body: `${draft.body}\n${footer}`,
      previewUrl: draft.previewUrl,
      mailingAddressConfigured: Boolean(address),
      aiWritten: draft.aiWritten,
    };
  });

/**
 * Super-admin only: sends a finished demo's preview link to the business by
 * email or text, after every safeguard in prospect-outreach.server (do-not-
 * contact, one send per channel unless `force`, daily caps, SMS quiet hours,
 * CAN-SPAM footer). `to` defaults to the demo's known email or phone.
 */
export const sendDemoOutreachFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { organizationId?: unknown; channel?: unknown; to?: unknown; subject?: unknown; body?: unknown; force?: unknown }) => {
      const { organizationId } = parseOrganizationId(input);
      const channel: OutreachChannel | null = input?.channel === "sms" ? "sms" : input?.channel === "email" ? "email" : null;
      if (!channel) throw new Error("Choose email or text.");
      const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);
      const subject = text(input?.subject, 200);
      const body = text(input?.body, 6000);
      return {
        organizationId,
        channel,
        to: text(input?.to, 200)?.trim() || null,
        ...(subject !== undefined ? { subject } : {}),
        ...(body !== undefined ? { body } : {}),
        force: input?.force === true,
      };
    },
  )
  .handler(async ({ context, data }): Promise<OutreachResult> => {
    const db = await guardedAdmin(context);
    const { loadDemoForOutreach, sendDemoOutreach } = await import("./prospect-outreach.server");
    let to = data.to;
    if (!to) {
      const demo = await loadDemoForOutreach(db, data.organizationId);
      to = (data.channel === "email" ? demo?.email : demo?.phone) ?? null;
    }
    if (!to) {
      return {
        ok: false,
        reason: "invalid_recipient",
        message: data.channel === "email"
          ? "There's no email on file for this business. Enter one to send."
          : "There's no phone number on file for this business. Enter one to send.",
      };
    }
    return sendDemoOutreach(db, { ...data, to, mode: "manual", actorId: String(context.userId) });
  });

/** Super-admin only: every outreach attempt for one demo, newest first (sent, failed and skipped with reasons). */
export const listDemoOutreachFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseOrganizationId)
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { listDemoOutreach } = await import("./prospect-outreach.server");
    return listDemoOutreach(db, data.organizationId);
  });

/** Super-admin only: one demo's build progress, preview link, claim state and outreach history (polled while building). */
export const getDemoStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseOrganizationId)
  .handler(async ({ context, data }): Promise<DemoStatus> => {
    const db = await guardedAdmin(context);
    const { getDemoStatus } = await import("./prospect-outreach.server");
    const status = await getDemoStatus(db, data.organizationId, new URL(getRequest().url).origin);
    if (!status) throw new Error("That demo site wasn't found.");
    return status;
  });

/**
 * Super-admin only: finds businesses in a niche and city that have no real
 * website (none, or only a social/directory page) on Google Places, skipping
 * ones that already have a demo. Read-only; capped per day to bound cost.
 */
export const findProspectsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { niche?: unknown; city?: unknown; state?: unknown; source?: unknown }) => {
    const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
    const niche = clean(input?.niche, 80);
    const city = clean(input?.city, 80);
    const state = clean(input?.state, 40);
    if (niche.length < 3) throw new Error("Enter the kind of business to look for, like \"mobile detailing\".");
    if (city.length < 2) throw new Error("Enter the city to search.");
    const source: "free" | "google" = input?.source === "google" ? "google" : "free";
    return { niche, city, state, source };
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

/**
 * Super-admin only: the prospect pipeline from source records, all-time.
 * Each stage is a distinct count; demo workspaces are never customers and an
 * accepted email is not proof it was read.
 */
export const getProspectPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const head = { count: "exact" as const, head: true };
    const { data: demoRows, error: demoError } = await db
      .from("website_settings")
      .select("organization_id, generation->prospectDemo")
      .not("generation->prospectDemo", "is", null)
      .limit(5000);
    if (demoError) throw new Error("Couldn't read prospect demos.");
    const demos = (demoRows ?? []) as Array<{ organization_id: string; prospectDemo: Record<string, unknown> | null }>;
    const ids = demos.map((d) => d.organization_id);
    const claimedIds = demos.filter((d) => typeof d.prospectDemo?.["claimedAt"] === "string").map((d) => d.organization_id);
    const distinct = (rows: Array<{ organization_id: string }> | null) => new Set((rows ?? []).map((r) => r.organization_id)).size;
    const none = Promise.resolve({ data: [] as Array<Record<string, unknown>>, count: 0, error: null });
    const [searches, jobs, sent, failed, optOuts, replies, views, paid] = await Promise.all([
      db.from("audit_logs").select("id", head).eq("action", "jarvis.prospects.search").gte("created_at", since30),
      ids.length ? db.from("generation_jobs").select("organization_id, status").in("organization_id", ids.slice(0, 1000)).limit(5000) : none,
      db.from("prospect_outreach").select("organization_id").eq("status", "sent").limit(10000),
      db.from("prospect_outreach").select("id", head).eq("status", "failed"),
      db.from("prospect_do_not_contact").select("*", head),
      db.from("prospect_inbound").select("organization_id").limit(10000),
      db.from("prospect_preview_events").select("organization_id").limit(20000),
      claimedIds.length ? db.from("organizations").select("id", head).in("id", claimedIds).not("setup_paid_at", "is", null) : none,
    ]);
    const jobRows = (jobs.data ?? []) as Array<{ organization_id: string; status: string }>;
    const withStatus = (s: string) => new Set(jobRows.filter((j) => j.status === s).map((j) => j.organization_id)).size;
    return {
      searchesLast30Days: searches.count ?? 0,
      demosCreated: demos.length,
      demosBuilt: withStatus("completed"),
      demosFailed: withStatus("failed"),
      businessesEmailed: distinct(sent.data as Array<{ organization_id: string }> | null),
      emailsFailed: failed.count ?? 0,
      optedOut: optOuts.count ?? 0,
      previewsOpened: distinct(views.data as Array<{ organization_id: string }> | null),
      businessesReplied: distinct(replies.data as Array<{ organization_id: string }> | null),
      demosClaimed: claimedIds.length,
      paidCustomers: paid.count ?? 0,
    };
  });
