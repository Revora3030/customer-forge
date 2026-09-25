/**
 * Live, AI-authored improvement suggestions for the builder chat.
 *
 * The AI reads the workspace's actual website (pages, sections, text) and
 * business facts, and proposes only changes that would concretely improve
 * THIS site. No fixed or canned suggestion list exists; if the AI cannot
 * answer, the caller shows no suggestions rather than a template.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiSuggestion = { label: string; instruction: string; reason: string };

export const getAiSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ suggestions: AiSuggestion[] }> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;

    // RLS scopes every read to workspaces the caller belongs to.
    const [org, profile, services, pages, sections] = await Promise.all([
      supabase.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
      supabase.from("services").select("name").eq("organization_id", orgId).eq("is_active", true).limit(20),
      supabase.from("website_pages").select("slug, title, seo_title, seo_description").eq("organization_id", orgId).limit(20),
      supabase
        .from("website_sections")
        .select("kind, heading, subheading, body, is_visible")
        .eq("organization_id", orgId)
        .order("sort_order")
        .limit(40),
    ]);
    if (!org.data) throw new Error("You don't have access to that workspace.");

    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
    const p = (profile.data ?? {}) as Record<string, unknown>;
    const snapshot = {
      business: {
        name: org.data.name,
        industry: org.data.industry,
        description: clip(p["description"], 400),
        phone_present: Boolean(p["phone"]),
        email_present: Boolean(p["email"]),
        hours_present: Boolean(p["hours"]),
        services: (services.data ?? []).map((s) => s.name),
      },
      pages: pages.data ?? [],
      sections: (sections.data ?? []).map((s) => ({
        kind: s.kind,
        visible: s.is_visible,
        heading: clip(s.heading, 120),
        subheading: clip(s.subheading, 160),
        body: clip(s.body, 240),
      })),
    };

    if (snapshot.sections.length === 0) return { suggestions: [] };

    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    const result = await generateStructuredOutput(
      { organizationId: orgId, userId: String(userId), task: "builder.suggestions" },
      {
        role: "primary",
        maxOutputTokens: 900,
        messages: [
          {
            role: "system",
            content:
              "You are a senior conversion designer reviewing a real business website. Propose 3 to 6 specific improvements that would measurably improve THIS site (clarity, conversions, trust from real facts, SEO gaps, missing contact paths, weak headings). Only suggest a change when the snapshot shows a genuine gap; never suggest something already done. Never invent facts, reviews, awards, prices or results. Return JSON: {\"suggestions\":[{\"label\":\"short button text, max 5 words\",\"instruction\":\"exact request to the builder AI\",\"reason\":\"one sentence on why, citing the site\"}]}",
          },
          { role: "user", content: JSON.stringify(snapshot) },
        ],
      },
    );

    const raw = Array.isArray(result.data["suggestions"]) ? (result.data["suggestions"] as unknown[]) : [];
    const suggestions: AiSuggestion[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const label = clip(r["label"], 48)?.trim();
      const instruction = clip(r["instruction"], 600)?.trim();
      if (!label || !instruction) continue;
      suggestions.push({ label, instruction, reason: clip(r["reason"], 200)?.trim() ?? "" });
      if (suggestions.length >= 6) break;
    }
    return { suggestions };
  });
