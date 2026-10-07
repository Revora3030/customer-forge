/**
 * How the private draft differs from what visitors see now, for the builder's
 * compare view ("Draft has 2 updated sections, 1 new section").
 *
 * Reads only through the caller's own session, so RLS keeps it inside their
 * workspace. Nothing is written.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { draftDiff, type DraftDiff } from "@/lib/builder-preview";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SectionLike = {
  id?: unknown;
  heading?: unknown;
  subheading?: unknown;
  body?: unknown;
  settings?: unknown;
  is_visible?: unknown;
  components?: { kind?: unknown; label?: unknown; body?: unknown; link_label?: unknown; link_url?: unknown; media_url?: unknown; settings?: unknown; is_visible?: unknown; sort_order?: unknown }[];
};

/** Stable fingerprint of what a visitor sees in one section. */
export function sectionPrint(section: SectionLike): string {
  const components = (section.components ?? [])
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((c) => [c.kind, c.label, c.body, c.link_label, c.link_url, c.media_url, c.settings, c.is_visible !== false]);
  return JSON.stringify([section.heading ?? null, section.subheading ?? null, section.body ?? null, section.settings ?? null, section.is_visible !== false, components]);
}

export const getDraftDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }): Promise<{ diff: DraftDiff | null }> => {
    const { data: live } = await context.supabase
      .from("website_versions")
      .select("pages")
      .eq("organization_id", data.organizationId)
      .eq("pages->>live_format", "1")
      .not("published_at", "is", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const livePages = ((live?.pages as { pages?: { sections?: SectionLike[] }[] } | null)?.pages ?? null);
    if (!Array.isArray(livePages)) return { diff: null };

    const [sections, components] = await Promise.all([
      context.supabase
        .from("website_sections")
        .select("id, heading, subheading, body, settings, is_visible")
        .eq("organization_id", data.organizationId)
        .limit(2000),
      context.supabase
        .from("website_components")
        .select("section_id, kind, label, body, link_label, link_url, media_url, settings, is_visible, sort_order")
        .eq("organization_id", data.organizationId)
        .limit(10000),
    ]);
    if (sections.error || components.error) throw new Error("Couldn't compare your draft right now.");
    const bySection = new Map<string, SectionLike["components"]>();
    for (const row of components.data ?? []) {
      const list = bySection.get(String(row.section_id)) ?? [];
      list.push(row as never);
      bySection.set(String(row.section_id), list);
    }
    const draft = (sections.data ?? []).map((row) => ({
      id: String(row.id),
      fingerprint: sectionPrint({ ...(row as SectionLike), components: bySection.get(String(row.id)) ?? [] }),
    }));
    const liveSections = livePages
      .flatMap((page) => page.sections ?? [])
      .filter((section) => typeof section.id === "string")
      .map((section) => ({ id: String(section.id), fingerprint: sectionPrint(section) }));
    return { diff: draftDiff(liveSections, draft) };
  });
