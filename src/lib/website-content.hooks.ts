import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";
import {
  buildContentBlueprint,
  type ContentComponent,
  type ContentPage,
  type ContentSection,
  type SectionKind,
} from "@/lib/website-content";
import { safeLinkUrl, slugify } from "@/lib/website-content";
import { readCopy } from "@/lib/site-engine";
import { useBuilderHistory } from "@/lib/builder-history.hooks";
import { duplicateComponentPayload, duplicateSectionPayload } from "@/lib/builder-tree";

const KEY = "website_content";

function useInvalidateContent(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [KEY, organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["production-readiness", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["production-status", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["build_readiness", organizationId] }),
    ]);
  };
}

/** Loads the full page → section → component tree for a workspace. */
export function useWebsiteContent(organizationId: string | undefined) {
  return useQuery({
    queryKey: [KEY, organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ContentPage[]> => {
      const orgId = organizationId!;
      const [pages, sections, components] = await Promise.all([
        supabase
          .from("website_pages")
          .select(
            "id, slug, title, kind, sort_order, is_visible, seo_title, seo_description, seo_canonical, og_title, og_description, og_image_url, noindex",
          )
          .eq("organization_id", orgId)
          .order("sort_order"),
        supabase
          .from("website_sections")
          .select(
            "id, page_id, kind, variant, heading, subheading, body, settings, sort_order, is_visible",
          )
          .eq("organization_id", orgId)
          .order("sort_order"),
        supabase
          .from("website_components")
          .select(
            "id, section_id, kind, label, body, media_url, link_url, link_label, settings, sort_order, is_visible",
          )
          .eq("organization_id", orgId)
          .order("sort_order"),
      ]);
      if (pages.error) throw pages.error;
      if (sections.error) throw sections.error;
      if (components.error) throw components.error;

      const bySection = new Map<string, ContentComponent[]>();
      for (const component of (components.data ?? []) as ContentComponent[]) {
        const list = bySection.get(component.section_id) ?? [];
        list.push(component);
        bySection.set(component.section_id, list);
      }
      const byPage = new Map<string, ContentSection[]>();
      for (const section of (sections.data ?? []) as Omit<ContentSection, "components">[]) {
        const list = byPage.get(section.page_id) ?? [];
        list.push({ ...section, components: bySection.get(section.id) ?? [] });
        byPage.set(section.page_id, list);
      }
      return (pages.data ?? []).map((page) => ({ ...page, sections: byPage.get(page.id) ?? [] }));
    },
  });
}

/**
 * Rebuilds the structure from the information the client already entered, so
 * nothing has to be typed twice. Existing rows are replaced in one pass.
 */
export function useBuildWebsiteStructure(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async () => {
      const orgId = organizationId!;
      const [org, profile, services, media, reviews, settings] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, industry, conversion_goal")
          .eq("id", orgId)
          .maybeSingle(),
        supabase.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
        supabase
          .from("services")
          .select("name, description, price, starting_price")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("media").select("id").eq("organization_id", orgId),
        supabase.from("reviews").select("id").eq("organization_id", orgId).eq("is_published", true),
        supabase
          .from("website_settings")
          .select("generation, seo")
          .eq("organization_id", orgId)
          .maybeSingle(),
      ]);
      const p = (profile.data ?? {}) as Record<string, unknown>;
      const generation = (settings.data?.generation ?? null) as Record<string, unknown> | null;
      const copy = readCopy(generation?.["copy"]);
      const seo = (settings.data?.seo ?? {}) as Record<string, unknown>;

      const blueprint = buildContentBlueprint({
        organizationId: orgId,
        businessName: org.data?.name ?? "",
        industry: org.data?.industry ?? null,
        city: (p["city"] as string) ?? null,
        state: (p["state"] as string) ?? null,
        serviceArea: (p["service_area"] as string) ?? null,
        description: copy?.about || ((p["description"] as string) ?? null),
        phone: (p["phone"] as string) ?? null,
        email: (p["email"] as string) ?? null,
        hasHours: Boolean(p["hours"] && Object.keys(p["hours"] as object).length),
        photoCount: (media.data ?? []).length + ((p["hero_image_url"] as string) ? 1 : 0),
        reviewCount: (reviews.data ?? []).length,
        ctaLabel: copy?.primaryCta || (seo["primary_cta_label"] as string) || "Get my price",
        services: services.data ?? [],
        benefits: copy?.benefits ?? [],
        faqs: copy?.faqs ?? [],
      });

      // Replace the previous structure; cascades clear old sections/components.
      const { error: clearError } = await supabase
        .from("website_pages")
        .delete()
        .eq("organization_id", orgId);
      if (clearError) throw clearError;

      for (const [pageIndex, page] of blueprint.entries()) {
        const { data: pageRow, error: pageError } = await supabase
          .from("website_pages")
          .insert({
            organization_id: orgId,
            slug: page.slug,
            title: page.title,
            kind: page.kind,
            sort_order: pageIndex,
            seo_title: page.seo_title ?? null,
            seo_description: page.seo_description ?? null,
            noindex: page.noindex ?? false,
          })
          .select("id")
          .single();
        if (pageError || !pageRow) throw pageError ?? new Error("Couldn't create the page.");

        for (const [sectionIndex, section] of page.sections.entries()) {
          const { data: sectionRow, error: sectionError } = await supabase
            .from("website_sections")
            .insert({
              organization_id: orgId,
              page_id: pageRow.id,
              kind: section.kind,
              variant: section.variant ?? "default",
              heading: section.heading ?? null,
              subheading: section.subheading ?? null,
              body: section.body ?? null,
              is_visible: section.is_visible ?? true,
              settings: section.needs_input ? { needs_input: true } : {},
              sort_order: sectionIndex,
            })

            .select("id")
            .single();
          if (sectionError || !sectionRow)
            throw sectionError ?? new Error("Couldn't create a section.");

          const components = section.components ?? [];
          if (components.length) {
            const { error: componentError } = await supabase.from("website_components").insert(
              components.map((component, index) => ({
                organization_id: orgId,
                section_id: sectionRow.id,
                kind: component.kind,
                label: component.label ?? null,
                body: component.body ?? null,
                link_url: safeLinkUrl(component.link_url),
                link_label: component.link_label ?? null,
                sort_order: index,
              })),
            );
            if (componentError) throw componentError;
          }
        }
      }
      return blueprint.length;
    },
    onSuccess: (count) => {
      toast.success(
        `${count} page${count === 1 ? "" : "s"} laid out from your business information.`,
      );
      void invalidate();
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't build your website structure.")),
  });
}

/**
 * Finds a row in the cached content tree so an edit's inverse can be recorded
 * for undo without an extra round trip.
 */
function useCachedRow(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return (table: "website_pages" | "website_sections" | "website_components", id: string) => {
    const pages = queryClient.getQueryData<ContentPage[]>([KEY, organizationId]);
    if (!pages) return null;
    for (const page of pages) {
      if (table === "website_pages") {
        if (page.id === id) return page as unknown as Record<string, unknown>;
        continue;
      }
      for (const section of page.sections) {
        if (table === "website_sections" && section.id === id)
          return section as unknown as Record<string, unknown>;
        if (table === "website_components") {
          const component = section.components.find((item) => item.id === id);
          if (component) return component as unknown as Record<string, unknown>;
        }
      }
    }
    return null;
  };
}

export function useSaveSection(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  const history = useBuilderHistory();
  const cachedRow = useCachedRow(organizationId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      history.capture({
        table: "website_sections",
        rowId: id,
        row: cachedRow("website_sections", id),
        patch,
      });
      const { error } = await supabase
        .from("website_sections")
        .update(patch as never)
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that section.")),
  });
}

export function useSavePage(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  const history = useBuilderHistory();
  const cachedRow = useCachedRow(organizationId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      history.capture({
        table: "website_pages",
        rowId: id,
        row: cachedRow("website_pages", id),
        patch,
      });
      const { error } = await supabase
        .from("website_pages")
        .update(patch as never)
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that page.")),
  });
}

export function useMoveSection(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async ({
      a,
      b,
    }: {
      a: { id: string; sort_order: number };
      b: { id: string; sort_order: number };
    }) => {
      const orgId = organizationId!;
      const first = await supabase
        .from("website_sections")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id)
        .eq("organization_id", orgId);
      if (first.error) throw first.error;
      const second = await supabase
        .from("website_sections")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id)
        .eq("organization_id", orgId);
      if (second.error) throw second.error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't reorder the sections.")),
  });
}

export function useAddSection(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async ({
      pageId,
      kind,
      sortOrder,
    }: {
      pageId: string;
      kind: SectionKind;
      sortOrder: number;
    }) => {
      const { error } = await supabase.from("website_sections").insert({
        organization_id: organizationId!,
        page_id: pageId,
        kind,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section added.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't add that section.")),
  });
}

export function useDeleteSection(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("website_sections")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section removed.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't remove that section.")),
  });
}

export type SectionEdit = {
  sectionId: string;
  sectionLabel: string;
  field: "heading" | "subheading" | "body";
  before: string;
  after: string;
};

/** Applies confirmed AI edits to sections — one update per changed field. */
export function useApplySectionEdits(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (edits: SectionEdit[]) => {
      const orgId = organizationId!;
      const grouped = new Map<string, Record<string, string>>();
      for (const edit of edits) {
        const patch = grouped.get(edit.sectionId) ?? {};
        patch[edit.field] = edit.after;
        grouped.set(edit.sectionId, patch);
      }
      for (const [id, patch] of grouped) {
        const { error } = await supabase
          .from("website_sections")
          .update(patch as never)
          .eq("id", id)
          .eq("organization_id", orgId);
        if (error) throw error;
      }
      return edits.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} change${count === 1 ? "" : "s"} applied to your website.`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't apply those changes.")),
  });
}

/** Silent autosave for the builder wizard — no toast per keystroke batch. */
export function useAutosaveProfile(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("business_profiles")
        .upsert({ organization_id: organizationId!, ...patch } as never, {
          onConflict: "organization_id",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["business_profile", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save your latest edit.")),
  });
}

/** Silent autosave for the workspace record (business name, trade, goal). */
export function useAutosaveOrganization(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("organizations")
        .update(patch as never)
        .eq("id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save your latest edit.")),
  });
}

/**
 * Persists a new order for sections or components after a drag. Each row keeps
 * all of its content — only `sort_order` changes.
 */
function useReorderRows(
  table: "website_sections" | "website_components",
  organizationId: string | undefined,
  failure: string,
) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const orgId = organizationId!;
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from(table)
          .update({ sort_order: index })
          .eq("id", id)
          .eq("organization_id", orgId);
        if (error) throw error;
      }
      return orderedIds.length;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message || failure),
  });
}

export function useReorderSections(organizationId: string | undefined) {
  return useReorderRows("website_sections", organizationId, "Couldn't reorder the sections.");
}

export function useReorderComponents(organizationId: string | undefined) {
  return useReorderRows("website_components", organizationId, "Couldn't reorder those items.");
}

export function useSaveComponent(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  const history = useBuilderHistory();
  const cachedRow = useCachedRow(organizationId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      // Link targets end up as hrefs on the public site: only safe schemes save.
      const clean = { ...patch };
      if ("link_url" in clean) {
        const safe = safeLinkUrl(clean["link_url"] as string | null);
        if (clean["link_url"] && !safe)
          throw new Error(
            "That link isn't allowed. Use a web address, /page, tel: or mailto: link.",
          );
        clean["link_url"] = safe;
      }
      history.capture({
        table: "website_components",
        rowId: id,
        row: cachedRow("website_components", id),
        patch: clean,
      });
      const { error } = await supabase
        .from("website_components")
        .update(clean as never)
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },

    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that item.")),
  });
}

/* ---------------------------------------------------------------------------
 * Shareable draft preview links
 * ------------------------------------------------------------------------- */

const PREVIEW_KEY = "website_preview_links";

export type PreviewLink = {
  id: string;
  token: string;
  label: string | null;
  expires_at: string;
  revoked: boolean;
  views: number;
  last_viewed_at: string | null;
  created_at: string;
};

export function usePreviewLinks(organizationId: string | undefined) {
  return useQuery({
    queryKey: [PREVIEW_KEY, organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<PreviewLink[]> => {
      const { data, error } = await supabase
        .from("website_preview_links")
        .select("id, token, label, expires_at, revoked, views, last_viewed_at, created_at")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PreviewLink[];
    },
  });
}

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

export function useCreatePreviewLink(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, hours }: { label: string; hours: number }) => {
      const token = newToken();
      const expires = new Date(Date.now() + Math.max(1, Math.min(720, hours)) * 3600_000);
      const { error } = await supabase.from("website_preview_links").insert({
        organization_id: organizationId!,
        token,
        label: label.trim() || null,
        expires_at: expires.toISOString(),
      });
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      toast.success("Preview link created.");
      void queryClient.invalidateQueries({ queryKey: [PREVIEW_KEY, organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't create a preview link.")),
  });
}

export function useRevokePreviewLink(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("website_preview_links")
        .update({ revoked: true })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preview link switched off.");
      void queryClient.invalidateQueries({ queryKey: [PREVIEW_KEY, organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't revoke that link.")),
  });
}

/* ------------------------------------------------------------------ *
 * Page management: add, rename, duplicate, hide, reorder, homepage,
 * delete. Every write is scoped to the workspace id.
 * ------------------------------------------------------------------ */

export function useReorderPages(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const orgId = organizationId!;
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from("website_pages")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("organization_id", orgId);
        if (error) throw error;
      }
      return orderedIds.length;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't reorder your pages.")),
  });
}

/** Adds an empty page the owner can then fill with sections. */
export function useAddPage(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async ({
      title,
      kind,
      sortOrder,
    }: {
      title: string;
      kind: string;
      sortOrder: number;
    }) => {
      const orgId = organizationId!;
      const clean = title.trim();
      if (!clean) throw new Error("Give the page a name first.");
      const { error } = await supabase.from("website_pages").insert({
        organization_id: orgId,
        title: clean,
        kind,
        slug: await uniquePageSlug(orgId, slugify(clean) || "page"),
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Page added.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't add that page.")),
  });
}

/** Copies a page with every section and item inside it. */
export function useDuplicatePage(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (page: ContentPage) => {
      const orgId = organizationId!;
      const slug = await uniquePageSlug(orgId, `${page.slug}-copy`);
      const inserted = await supabase
        .from("website_pages")
        .insert({
          organization_id: orgId,
          title: `${page.title} (copy)`,
          // A second "home" page would fight the published home route.
          kind: page.kind === "home" ? "custom" : page.kind,
          slug,
          sort_order: page.sort_order + 1,
          is_visible: false,
          seo_title: page.seo_title,
          seo_description: page.seo_description,
          og_title: page.og_title,
          og_description: page.og_description,
          og_image_url: page.og_image_url,
          noindex: page.noindex,
        } as never)
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      const newPageId = (inserted.data as { id: string }).id;

      for (const section of page.sections) {
        const copy = await supabase
          .from("website_sections")
          .insert({
            organization_id: orgId,
            page_id: newPageId,
            kind: section.kind,
            variant: section.variant,
            heading: section.heading,
            subheading: section.subheading,
            body: section.body,
            settings: section.settings as never,
            sort_order: section.sort_order,
            is_visible: section.is_visible,
          } as never)
          .select("id")
          .single();
        if (copy.error) throw copy.error;
        const newSectionId = (copy.data as { id: string }).id;
        if (!section.components.length) continue;
        const { error } = await supabase.from("website_components").insert(
          section.components.map((component) => ({
            organization_id: orgId,
            section_id: newSectionId,
            kind: component.kind,
            label: component.label,
            body: component.body,
            media_url: component.media_url,
            link_url: safeLinkUrl(component.link_url),
            link_label: component.link_label,
            settings: component.settings,
            sort_order: component.sort_order,
            is_visible: component.is_visible,
          })) as never,
        );
        if (error) throw error;
      }
      return slug;
    },
    onSuccess: () => {
      toast.success("Page duplicated — it stays hidden until you show it.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't duplicate that page.")),
  });
}

/** Promotes a page to the published home page and demotes the old one. */
export function useSetHomePage(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async ({
      pageId,
      currentHomeId,
    }: {
      pageId: string;
      currentHomeId: string | null;
    }) => {
      const orgId = organizationId!;
      if (currentHomeId && currentHomeId !== pageId) {
        const demote = await supabase
          .from("website_pages")
          .update({ kind: "custom" })
          .eq("id", currentHomeId)
          .eq("organization_id", orgId);
        if (demote.error) throw demote.error;
      }
      const promote = await supabase
        .from("website_pages")
        .update({ kind: "home", is_visible: true, sort_order: 0 })
        .eq("id", pageId)
        .eq("organization_id", orgId);
      if (promote.error) throw promote.error;
    },
    onSuccess: () => {
      toast.success("Home page updated.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't set that home page.")),
  });
}

export function useDeletePage(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (page: ContentPage) => {
      if (page.kind === "home") throw new Error("Set another page as your home page first.");
      const { error } = await supabase
        .from("website_pages")
        .delete()
        .eq("id", page.id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Page deleted.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't delete that page.")),
  });
}

/** Keeps page addresses unique inside one workspace. */
async function uniquePageSlug(organizationId: string, base: string) {
  const root = slugify(base) || "page";
  const { data } = await supabase
    .from("website_pages")
    .select("slug")
    .eq("organization_id", organizationId);
  const taken = new Set((data ?? []).map((row) => (row as { slug: string }).slug));
  if (!taken.has(root)) return root;
  for (let index = 2; index < 200; index += 1) {
    const candidate = `${root}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/* ---------------------------------------------------------------------------
 * Visual builder element mutations
 *
 * The visual canvas needs to add, copy, delete and restore individual elements
 * as well as whole sections. Each mutation writes through the same organisation
 * scoped tables (so RLS still decides what is allowed) and returns enough
 * information for the canvas to keep the client's selection and to offer an
 * immediate undo of a deletion.
 * ------------------------------------------------------------------------- */

/** Adds one element inside a section, at the end or after a given item. */
export function useAddComponent(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async ({
      sectionId,
      kind,
      sortOrder,
      values,
    }: {
      sectionId: string;
      kind: string;
      sortOrder: number;
      values?: Partial<Pick<ContentComponent, "label" | "body" | "link_label" | "link_url">>;
    }) => {
      const clean = { ...(values ?? {}) } as Record<string, unknown>;
      if (clean["link_url"]) {
        const safe = safeLinkUrl(clean["link_url"] as string);
        if (!safe) throw new Error("That link isn't allowed.");
        clean["link_url"] = safe;
      }
      const inserted = await supabase
        .from("website_components")
        .insert({
          organization_id: organizationId!,
          section_id: sectionId,
          kind,
          sort_order: sortOrder,
          ...clean,
        } as never)
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      return (inserted.data as { id: string }).id;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't add that element.")),
  });
}

/** Copies one element directly after the original. Never reuses its id. */
export function useDuplicateComponent(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (component: ContentComponent) => {
      const inserted = await supabase
        .from("website_components")
        .insert(duplicateComponentPayload(component, organizationId!) as never)
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      return (inserted.data as { id: string }).id;
    },
    onSuccess: () => {
      toast.success("Element duplicated.");
      void invalidate();
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't duplicate that element.")),
  });
}

/**
 * Deletes one element and hands the full row back, so the canvas can offer
 * "Undo" and put the client's work back exactly as it was.
 */
export function useDeleteComponent(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (component: ContentComponent) => {
      const { error } = await supabase
        .from("website_components")
        .delete()
        .eq("id", component.id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return component;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't remove that element.")),
  });
}

/** Re-inserts a deleted element (undo), keeping its content and design. */
export function useRestoreComponent(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (component: ContentComponent) => {
      const payload = duplicateComponentPayload(component, organizationId!);
      const { error } = await supabase
        .from("website_components")
        .insert({ ...payload, sort_order: component.sort_order } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Element restored.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't restore that element.")),
  });
}

/** Copies a section with all of its elements, immediately after the original. */
export function useDuplicateSection(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (section: ContentSection) => {
      const orgId = organizationId!;
      const inserted = await supabase
        .from("website_sections")
        .insert(duplicateSectionPayload(section, orgId) as never)
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      const newSectionId = (inserted.data as { id: string }).id;

      if (section.components.length) {
        const { error } = await supabase.from("website_components").insert(
          section.components.map((component) => ({
            ...duplicateComponentPayload(component, orgId, newSectionId),
            sort_order: component.sort_order,
          })) as never,
        );
        if (error) throw error;
      }

      // Renumber the page so the copy sits directly after its original.
      const rows = await supabase
        .from("website_sections")
        .select("id, sort_order")
        .eq("organization_id", orgId)
        .eq("page_id", section.page_id)
        .order("sort_order");
      if (rows.error) throw rows.error;
      const ids = (rows.data ?? []).map((row) => (row as { id: string }).id);
      for (const [index, id] of ids.entries()) {
        const { error } = await supabase
          .from("website_sections")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("organization_id", orgId);
        if (error) throw error;
      }
      return newSectionId;
    },
    onSuccess: () => {
      toast.success("Section duplicated.");
      void invalidate();
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't duplicate that section.")),
  });
}

/** Re-inserts a deleted section with its elements (undo for a section delete). */
export function useRestoreSection(organizationId: string | undefined) {
  const invalidate = useInvalidateContent(organizationId);
  return useMutation({
    mutationFn: async (section: ContentSection) => {
      const orgId = organizationId!;
      const inserted = await supabase
        .from("website_sections")
        .insert({
          ...duplicateSectionPayload(section, orgId),
          sort_order: section.sort_order,
        } as never)
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      const newSectionId = (inserted.data as { id: string }).id;
      if (!section.components.length) return;
      const { error } = await supabase.from("website_components").insert(
        section.components.map((component) => ({
          ...duplicateComponentPayload(component, orgId, newSectionId),
          sort_order: component.sort_order,
        })) as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section restored.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't restore that section.")),
  });
}
