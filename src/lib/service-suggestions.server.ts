/**
 * Asks the AI team for DRAFT package suggestions for one workspace. Nothing is
 * saved here: the owner reads each suggestion, edits it and saves it
 * themselves, and every price and duration stays theirs to enter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSuggestionMessages, parseSuggestedPackages, type ServiceBrief, type SuggestedPackage } from "@/lib/service-suggestions";

export type SuggestionOutcome =
  | { ok: true; packages: SuggestedPackage[] }
  | { ok: false; reason: "busy" | "unavailable" | "empty"; message: string };

/** One workspace may ask a few times an hour; the AI budget gates sit behind this. */
const ASKS_PER_HOUR = 6;
const asks = new Map<string, number[]>();

export function allowSuggestionAsk(organizationId: string, now = Date.now()): boolean {
  const recent = (asks.get(organizationId) ?? []).filter((at) => now - at < 3_600_000);
  if (recent.length >= ASKS_PER_HOUR) {
    asks.set(organizationId, recent);
    return false;
  }
  recent.push(now);
  asks.set(organizationId, recent);
  if (asks.size > 2000) asks.delete(asks.keys().next().value as string);
  return true;
}

export async function suggestPackages(
  db: Pick<SupabaseClient, "from">,
  organizationId: string,
  userId: string,
): Promise<SuggestionOutcome> {
  if (!allowSuggestionAsk(organizationId)) {
    return { ok: false, reason: "busy", message: "You've asked for suggestions a few times already. Try again in a little while." };
  }
  const [org, services] = await Promise.all([
    db.from("organizations").select("name, industry").eq("id", organizationId).maybeSingle(),
    db.from("services").select("name, description, price").eq("organization_id", organizationId).limit(40),
  ]);
  const existing = ((services.data ?? []) as ServiceBrief[]).filter((service) => service.name);
  const { system, user } = buildSuggestionMessages({
    businessName: String((org.data as { name?: string } | null)?.name ?? ""),
    industry: ((org.data as { industry?: string | null } | null)?.industry ?? null) as string | null,
    existing,
  });
  const { callBestThinker } = await import("@/lib/ai/thinker.server");
  const call = await callBestThinker({
    stage: "service_suggestions",
    purpose: "content_strategy",
    complexity: "low",
    organizationId,
    userId,
    json: true,
    maxOutputTokens: 900,
    system,
    user,
  });
  if (!call.ok) {
    return { ok: false, reason: "unavailable", message: "The AI team couldn't be reached just now. You can still write your own packages with Add service." };
  }
  const packages = parseSuggestedPackages(call.text, existing.map((service) => service.name));
  if (!packages.length) {
    return { ok: false, reason: "empty", message: "No usable suggestions came back this time. Try again, or add a service yourself." };
  }
  return { ok: true, packages };
}
