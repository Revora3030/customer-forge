/**
 * Server side of LOV-16. Runs only when an owner/admin/manager asks. READ-ONLY:
 * every query below is a select with the caller's own credentials (row level
 * security applies) and an explicit organization filter; the model call has no
 * tools. Spend goes through the shared router, so Luna's monthly cap, the
 * per-workspace cap and the daily paid reservation apply unchanged. Nothing is
 * saved, sent or changed by this module.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AiCaller, AiRequest } from "@/lib/ai/types";
import { requireOrgRole } from "@/lib/org-authz.server";
import {
  ASK_AI_ROW_CAP,
  buildAskAiContext,
  buildAskAiMessages,
  cleanAskAiAnswer,
  sectionsForTopic,
  ungroundedNumbers,
  type AskAiData,
  type AskAiInput,
  type AskAiResult,
} from "@/lib/ask-ai";

type Db = SupabaseClient<Database>;
export const ASK_AI_MODEL = "google/gemini-2.5-flash";
const DAY_MS = 86_400_000;

export type AskAiDeps = {
  generate: (caller: AiCaller, request: AiRequest) => Promise<{ text: string; model: string }>;
  now?: () => Date;
};

type Capped<T> = { rows: T[]; capped: boolean };

function capped<T>(rows: T[] | null): Capped<T> {
  const list = rows ?? [];
  return { rows: list, capped: list.length >= ASK_AI_ROW_CAP };
}

export async function loadAskAiData(userDb: Db, organizationId: string, input: AskAiInput, now: Date): Promise<AskAiData> {
  const org = organizationId;
  const since = new Date(now.getTime() - input.days * DAY_MS).toISOString();
  const wanted = new Set(sectionsForTopic(input.topic, Boolean(input.leadId)));
  const unavailable: string[] = [];
  const data: AskAiData = {
    orgName: "",
    industry: null,
    now,
    days: input.days,
    traffic: null,
    leads: null,
    appointments: null,
    quotes: null,
    reviews: null,
    site: null,
    lead: null,
    unavailable,
  };

  const orgRow = await userDb.from("organizations").select("name, industry").eq("id", org).maybeSingle();
  if (orgRow.error || !orgRow.data) throw new Error("Couldn't load your workspace. Try again.");
  data.orgName = orgRow.data.name ?? "";
  data.industry = orgRow.data.industry ?? null;

  const job = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch {
      unavailable.push(name);
    }
  };
  const ok = <T,>(res: { data: T | null; error: unknown }): T => {
    if (res.error) throw new Error("read failed");
    return res.data as T;
  };

  await Promise.all([
    wanted.has("traffic") &&
      job("website traffic", async () => {
        const rows = ok(
          await userDb
            .from("analytics_events")
            .select("event_type, source, path, device, created_at")
            .eq("organization_id", org)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(ASK_AI_ROW_CAP),
        );
        data.traffic = capped(rows);
      }),
    wanted.has("leads") &&
      job("leads", async () => {
        const rows = ok(
          await userDb
            .from("leads")
            .select("id, name, status, source, service_interest, estimated_value, created_at, first_response_at, next_follow_up_at, message, notes")
            .eq("organization_id", org)
            .order("created_at", { ascending: false })
            .limit(ASK_AI_ROW_CAP),
        );
        data.leads = capped(rows);
      }),
    wanted.has("appointments") &&
      job("bookings", async () => {
        const rows = ok(
          await userDb
            .from("appointments")
            .select("status, starts_at")
            .eq("organization_id", org)
            .gte("starts_at", since)
            .order("starts_at", { ascending: false })
            .limit(ASK_AI_ROW_CAP),
        );
        data.appointments = capped(rows);
      }),
    wanted.has("quotes") &&
      job("quotes", async () => {
        const rows = ok(
          await userDb
            .from("quotes")
            .select("status, created_at")
            .eq("organization_id", org)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(ASK_AI_ROW_CAP),
        );
        data.quotes = capped(rows);
      }),
    wanted.has("reviews") &&
      job("reviews", async () => {
        const rows = ok(
          await userDb
            .from("reviews")
            .select("rating, comment, created_at, is_published")
            .eq("organization_id", org)
            .order("created_at", { ascending: false })
            .limit(ASK_AI_ROW_CAP),
        );
        data.reviews = capped(rows);
      }),
    wanted.has("site") &&
      job("website", async () => {
        const [pages, settings, services] = await Promise.all([
          userDb.from("website_pages").select("title, slug, is_visible, seo_title, seo_description, noindex").eq("organization_id", org).order("sort_order", { ascending: true }).limit(60),
          userDb.from("website_settings").select("published, last_published_at, custom_domain, domain_status").eq("organization_id", org).maybeSingle(),
          userDb.from("services").select("name, price, starting_price, is_active").eq("organization_id", org).order("sort_order", { ascending: true }).limit(60),
        ]);
        data.site = { pages: ok(pages) ?? [], settings: ok(settings), services: ok(services) ?? [] };
      }),
    wanted.has("lead") &&
      job("the selected lead", async () => {
        const row = ok(
          await userDb
            .from("leads")
            .select("id, name, status, source, service_interest, estimated_value, created_at, first_response_at, next_follow_up_at, message, notes")
            .eq("organization_id", org)
            .eq("id", input.leadId as string)
            .maybeSingle(),
        );
        if (!row) throw new Error("not found");
        data.lead = row;
      }),
  ]);
  return data;
}

export async function buildAskAiAnswer(userDb: Db, userId: string, input: AskAiInput, deps: AskAiDeps): Promise<AskAiResult> {
  // Owner, admin or manager only. Staff and viewers never reach the data.
  const organizationId = await requireOrgRole(userDb, input.organizationId, userId, "manager");
  const data = await loadAskAiData(userDb, organizationId, input, deps.now?.() ?? new Date());
  const context = buildAskAiContext(data);
  const result = await deps.generate(
    { organizationId, userId, task: "owner.ask-ai" },
    {
      role: "fast",
      preferModels: [ASK_AI_MODEL],
      maxOutputTokens: 600,
      temperature: 0.2,
      messages: buildAskAiMessages(input.question, context),
    },
  );
  const answer = cleanAskAiAnswer(result.text);
  if (!answer) throw new Error("The answer didn't come back. Try again.");
  return {
    answer,
    facts: context.facts,
    unavailable: data.unavailable,
    unverifiedFigures: ungroundedNumbers(answer, context, input.question),
    days: input.days,
    model: result.model,
  };
}
