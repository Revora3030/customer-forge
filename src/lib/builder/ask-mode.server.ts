/**
 * Ask mode answer (COMP-2 + LOV-1). READ-ONLY by construction: only `.select`
 * reads, no AI tools. `ask-mode.functions.test.ts` fails if a write appears.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { askMessages, buildAskSnapshot, parseAskAnswer, type AskAnswer } from "@/lib/builder/ask-mode";

export async function answerAskQuestion(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: { organizationId: string; question: string },
): Promise<AskAnswer> {
  const orgId = data.organizationId;
  const { assertOrgEntitled } = await import("@/lib/entitlement.server");
  await assertOrgEntitled(supabase, orgId);

  // RLS scopes every read to workspaces the caller belongs to.
  const [org, profile, services, pages, sections] = await Promise.all([
    supabase.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
    supabase
      .from("business_profiles")
      .select("tagline, description, phone, email, address, city, state, zip, service_area, hours")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("services")
      .select("name, description, price, starting_price")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("sort_order")
      .limit(40),
    supabase.from("website_pages").select("id, slug, title, seo_title, seo_description").eq("organization_id", orgId).limit(30),
    supabase
      .from("website_sections")
      .select("page_id, kind, heading, body, is_visible")
      .eq("organization_id", orgId)
      .order("sort_order")
      .limit(60),
  ]);
  if (!org.data) throw new Error("You don't have access to that workspace.");

  const snapshot = buildAskSnapshot({
    org: org.data as Record<string, unknown>,
    profile: (profile.data ?? null) as Record<string, unknown> | null,
    services: (services.data ?? []) as Record<string, unknown>[],
    pages: (pages.data ?? []) as Record<string, unknown>[],
    sections: (sections.data ?? []) as Record<string, unknown>[],
  });

  const { generateStructuredOutput } = await import("@/lib/ai/router.server");
  const result = await generateStructuredOutput(
    { organizationId: orgId, userId: String(userId), task: "builder.ask" },
    { role: "primary", maxOutputTokens: 900, messages: askMessages(snapshot, data.question) },
  );
  return parseAskAnswer(result.data);
}
