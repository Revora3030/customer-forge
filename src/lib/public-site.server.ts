/**
 * Server-only loader for public business websites.
 *
 * Shared by the published site (`/s/:slug`) and time-limited draft preview
 * links (`/p/:token`). The only difference between them is whether an
 * unpublished draft may be served, which the caller states explicitly.
 */
import { customerBusinessEmail, sanitizeServices } from "@/lib/builder/intake-sanitize";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { safeLinkUrl } from "@/lib/website-content";

export function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Resolves the public-safe fields of a business by slug (or id).
 *
 * Organization rows hold billing, plan, trial and onboarding data, so neither
 * anonymous nor cross-tenant authenticated clients may read the table. Public
 * site rendering runs on the server, so it resolves the handful of public
 * fields with the privileged client and returns nothing else.
 */
export async function publicOrganization(by: { slug: string } | { id: string }): Promise<{
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  is_demo: boolean;
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("organizations")
    .select("id, name, slug, industry, is_demo")
    .eq("is_suspended", false);
  query = "slug" in by ? query.eq("slug", by.slug) : query.eq("id", by.id);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

export type SiteSectionSettings = ({
  seo?: {
    anchor?: string;
    seo_heading_level?: "h2" | "h3";
    include_in_schema?: boolean;
    image_alt?: string;
  };
} & { [key: string]: Json | undefined }) | null;

export type SiteComponent = {
  id: string;
  section_id: string;
  kind: string;
  label: string | null;
  body: string | null;
  media_url: string | null;
  /** Signed, viewable URL for private media. */
  url: string | null;
  link_url: string | null;
  link_label: string | null;
  settings: Json;
  sort_order: number;
};

export type SiteSection = {
  id: string;
  kind: string;
  variant: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  settings: SiteSectionSettings;
  sort_order: number;
  components?: SiteComponent[];
};

/** Marker on production snapshots that can be served to visitors as-is. */
export const LIVE_SNAPSHOT_FORMAT = 1;

type LiveRow = Record<string, unknown>;
export type LiveSnapshot = {
  versionId: string;
  version: number;
  publishedAt: string | null;
  settingsPages: unknown;
  seo: unknown;
  generation: unknown;
  pages: (LiveRow & { sections: (LiveRow & { components: LiveRow[] })[] })[];
};

/**
 * The last version the owner actually published. Visitors are served this
 * copy, so builder and AI edits stay in the draft until the owner presses
 * Publish. Sites published before live snapshots existed have none and keep
 * the previous behaviour (served from the working tree) until their next
 * publish, so no live site is ever rolled back to an old copy.
 */
export async function loadLiveSnapshot(orgId: string): Promise<LiveSnapshot | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("website_versions")
      .select("id, version, pages, seo, generation, published_at")
      .eq("organization_id", orgId)
      .eq("pages->>live_format", String(LIVE_SNAPSHOT_FORMAT))
      .not("published_at", "is", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const body = (data.pages ?? {}) as Record<string, unknown>;
    if (body["live_format"] !== LIVE_SNAPSHOT_FORMAT || !Array.isArray(body["pages"])) return null;
    return {
      versionId: String(data.id),
      version: Number(data.version),
      publishedAt: (data.published_at as string | null) ?? null,
      settingsPages: body["settings_pages"] ?? null,
      seo: data.seo,
      generation: data.generation,
      pages: body["pages"] as LiveSnapshot["pages"],
    };
  } catch (error) {
    console.error("[public-site] live snapshot could not be read", {
      organizationId: orgId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const bySortOrder = (a: LiveRow, b: LiveRow) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0);
const visible = (row: LiveRow) => row["is_visible"] !== false;

/**
 * Reads everything a business website renders. `allowUnpublished` is only ever
 * true behind an authorised, unexpired preview token.
 */
export async function loadSite(
  slug: string,
  options?: { allowUnpublished?: boolean; pageSlug?: string },
) {
  const allowUnpublished = options?.allowUnpublished === true;

  // Anonymous reads are limited to published sites by policy, so an authorised
  // draft preview reads with the privileged client instead.
  const supabase = allowUnpublished
    ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
    : publicClient();

  const org = await publicOrganization({ slug });

  if (!org?.id) return null;
  const orgId: string = org.id;

  // The publish gate reads the same source the rendering read uses: the safe
  // published-only projection for visitors, the base row for an authorised
  // draft preview.
  const { data: gate } = await (allowUnpublished
    ? supabase
        .from("website_settings")
        .select("publish_state, published")
        .eq("organization_id", orgId)
        .maybeSingle()
    : supabase
        .from("public_website_settings")
        .select("publish_state, published")
        .eq("organization_id", orgId)
        .maybeSingle());

  // A client site is served on its public address only once it is published.
  // Unpublished work stays private: the owner previews it inside the builder,
  // or shares a signed preview link (/p/<token>).
  if (!allowUnpublished) {
    if (!gate || gate.publish_state !== "published") return null;
  }
  // Visitors see the last published version, never in-progress edits.
  const live = allowUnpublished ? null : await loadLiveSnapshot(orgId);

  const [profile, services, settings, social, reviews, galleryRows, quoteForm] = await Promise.all([
    supabase
      .from("public_business_profiles")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("services")
      .select(
        "id, name, description, category, price, starting_price, duration_minutes, image_url, bookable, featured, sort_order",
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("sort_order"),
    allowUnpublished
      ? supabase
          .from("website_settings")
          // Draft preview only, behind an authorised token. Public rendering
          // columns only — operational/domain columns (domain_transfer,
          // email_forwarding, ssl_detail, domain_records, domain_seo_report,
          // ...) are never read for rendering.
          .select(
            "id, organization_id, template, pages, seo, custom_domain, published, publish_state, last_published_at, generation, created_at, updated_at",
          )
          .eq("organization_id", orgId)
          .maybeSingle()
      : // Anonymous visitors read the safe published-only projection, which
        // exposes exactly these rendering columns and nothing else.
        supabase
          .from("public_website_settings")
          .select("*")
          .eq("organization_id", orgId)
          .maybeSingle(),

    supabase.from("social_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    supabase
      .from("public_reviews")
      .select("id, author_name, rating, comment, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("media")
      .select("id, url, alt_text, category")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("quote_forms")
      .select("id, name, base_price, min_price, max_price")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      // Ordered by id: anonymous visitors have no column privilege on
      // created_at, and ordering by it raises a permission error.
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);

  let questions: {
    id: string;
    label: string;
    helper_text: string | null;
    sort_order: number;
    options: { id: string; label: string; price_modifier: number; modifier_type: string }[];
  }[] = [];
  let addons: { id: string; label: string; description: string | null; price: number }[] = [];

  if (quoteForm.data) {
    const { data: qs } = await supabase
      .from("quote_questions")
      .select("id, label, helper_text, sort_order")
      .eq("organization_id", orgId)
      .eq("form_id", quoteForm.data.id)
      .order("sort_order");
    const ids = (qs ?? []).map((q) => q.id);
    const { data: opts } = ids.length
      ? await supabase
          .from("quote_options")
          .select("id, question_id, label, price_modifier, modifier_type, sort_order")
          .eq("organization_id", orgId)
          .in("question_id", ids)
          .order("sort_order")
      : { data: [] };
    questions = (qs ?? []).map((q) => ({
      ...q,
      options: (opts ?? [])
        .filter((o) => o.question_id === q.id)
        .map((o) => ({
          id: o.id,
          label: o.label,
          price_modifier: Number(o.price_modifier),
          modifier_type: o.modifier_type,
        })),
    }));

    const { data: adds } = await supabase
      .from("quote_addons")
      .select("id, label, description, price, sort_order")
      .eq("organization_id", orgId)
      .eq("form_id", quoteForm.data.id)
      .order("sort_order");
    addons = (adds ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      price: Number(a.price),
    }));
  }

  // Photos live in a private bucket, so pages get short-lived signed URLs.
  const { MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS, isStoragePath } = await import("@/lib/media");
  const gallery = galleryRows.data ?? [];
  const profileRow = profile.data;

  // Structured content: the builder's page/section tree. Loads the requested
  // page when one is asked for, otherwise the home page, plus the navigation
  // list of every page that is allowed to be shown.
  type CurrentPage = {
    id: string;
    slug: string;
    title: string;
    kind: string;
    seo_title: string | null;
    seo_description: string | null;
    seo_canonical: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image_url: string | null;
    noindex: boolean;
  };
  type NavRow = { id: string; slug: string; title: string; kind: string; noindex: boolean; sort_order: number };
  let currentPage: CurrentPage | null = null;
  let navRows: NavRow[] | null = null;
  let populatedPages = new Set<string>();
  let sections: SiteSection[] = [];
  let componentRows: (Omit<SiteComponent, "url"> & { url?: string | null })[] = [];

  if (live) {
    const livePages = live.pages.filter(visible).sort(bySortOrder);
    const target = options?.pageSlug
      ? livePages.find((page) => page["slug"] === options.pageSlug)
      : livePages.find((page) => page["kind"] === "home");
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    const pick = (page: LiveRow): CurrentPage => ({
      id: String(page["id"]),
      slug: String(page["slug"] ?? ""),
      title: String(page["title"] ?? ""),
      kind: String(page["kind"] ?? "page"),
      seo_title: text(page["seo_title"]),
      seo_description: text(page["seo_description"]),
      seo_canonical: text(page["seo_canonical"]),
      og_title: text(page["og_title"]),
      og_description: text(page["og_description"]),
      og_image_url: text(page["og_image_url"]),
      noindex: page["noindex"] === true,
    });
    currentPage = target ? pick(target) : null;
    navRows = livePages.map((page) => ({
      id: String(page["id"]),
      slug: String(page["slug"] ?? ""),
      title: String(page["title"] ?? ""),
      kind: String(page["kind"] ?? "page"),
      noindex: page["noindex"] === true,
      sort_order: Number(page["sort_order"] ?? 0),
    }));
    populatedPages = new Set(
      livePages.filter((page) => (page.sections ?? []).some(visible)).map((page) => String(page["id"])),
    );
    const liveSections = (target?.sections ?? []).filter(visible).sort(bySortOrder);
    sections = liveSections.map((section) => ({
      id: section["id"],
      kind: section["kind"],
      variant: section["variant"],
      heading: section["heading"] ?? null,
      subheading: section["subheading"] ?? null,
      body: section["body"] ?? null,
      settings: section["settings"] ?? {},
      sort_order: section["sort_order"] ?? 0,
    })) as unknown as SiteSection[];
    componentRows = liveSections.flatMap((section) =>
      (section.components ?? [])
        .filter(visible)
        .sort(bySortOrder)
        .map((component) => ({
          id: component["id"],
          section_id: component["section_id"] ?? section["id"],
          kind: component["kind"],
          label: component["label"] ?? null,
          body: component["body"] ?? null,
          media_url: component["media_url"] ?? null,
          link_url: component["link_url"] ?? null,
          link_label: component["link_label"] ?? null,
          settings: component["settings"] ?? {},
          sort_order: component["sort_order"] ?? 0,
        })),
    ) as unknown as typeof componentRows;
  } else {
    const pageColumns =
      "id, slug, title, kind, seo_title, seo_description, seo_canonical, og_title, og_description, og_image_url, noindex";
    const pageQuery = supabase.from("website_pages").select(pageColumns).eq("organization_id", orgId);
    const scopedPage = options?.pageSlug
      ? pageQuery.eq("slug", options.pageSlug)
      : pageQuery.eq("kind", "home");
    const { data: currentPageRow } = await (allowUnpublished
      ? scopedPage.maybeSingle()
      : scopedPage.eq("is_visible", true).maybeSingle());

    const navQuery = supabase
      .from("website_pages")
      .select("id, slug, title, kind, noindex, sort_order")
      .eq("organization_id", orgId);
    const { data: navRowsData } = await (allowUnpublished
      ? navQuery.order("sort_order")
      : navQuery.eq("is_visible", true).order("sort_order"));

    // Never link the menu to a page that has no visible sections — it would open
    // a blank page for a visitor.
    const sectionCountQuery = supabase
      .from("website_sections")
      .select("page_id")
      .eq("organization_id", orgId);
    const { data: navSectionRows } = await (allowUnpublished
      ? sectionCountQuery
      : sectionCountQuery.eq("is_visible", true));
    populatedPages = new Set((navSectionRows ?? []).map((row) => row.page_id as string));

    currentPage = (currentPageRow as CurrentPage | null) ?? null;
    navRows = (navRowsData as NavRow[] | null) ?? null;
    if (currentPage?.id) {
      const query = supabase
        .from("website_sections")
        .select("id, kind, variant, heading, subheading, body, settings, sort_order")
        .eq("organization_id", orgId)
        .eq("page_id", currentPage.id);
      const { data: rows } = await (allowUnpublished
        ? query.order("sort_order")
        : query.eq("is_visible", true).order("sort_order"));
      sections = (rows ?? []) as SiteSection[];
    }

    if (sections.length) {
      const componentQuery = supabase
        .from("website_components")
        .select("id, section_id, kind, label, body, media_url, link_url, link_label, settings, sort_order")
        .eq("organization_id", orgId)
        .in(
          "section_id",
          sections.map((section) => section.id),
        );
      const { data: rows } = await (allowUnpublished
        ? componentQuery.order("sort_order")
        : componentQuery.eq("is_visible", true).order("sort_order"));
      componentRows = (rows ?? []) as typeof componentRows;
    }

  }

  const toSign = [
    ...gallery.map((g) => g.url),
    profileRow?.logo_url ?? null,
    profileRow?.hero_image_url ?? null,
    currentPage?.og_image_url ?? null,
    ...componentRows.map((row) => row.media_url),
  ].filter((value): value is string => typeof value === "string" && isStoragePath(value));

  const signed = new Map<string, string>();
  if (toSign.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uniquePaths = [...new Set(toSign)];
    const { data: urls, error: signingError } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);
    if (signingError) {
      console.error("[public-site] website pictures could not be signed", {
        organizationId: orgId,
        count: uniquePaths.length,
        message: signingError.message,
      });
    }
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      else if (entry.path)
        console.error("[public-site] a website picture could not be resolved", {
          organizationId: orgId,
          path: entry.path,
          message: entry.error ?? "No signed URL was returned.",
        });
    }
  }
  const resolve = (value: string | null): string | null =>
    value ? (isStoragePath(value) ? (signed.get(value) ?? null) : value) : value;

  let components: SiteComponent[] = [];
  if (componentRows.length) {
    // Links are scheme-allowlisted here so no consumer can render a javascript:/data: href.
    components = componentRows.map((row) => ({
      ...row,
      link_url: safeLinkUrl(row.link_url),
      url: resolve(row.media_url),
    })) as SiteComponent[];
  }

  const sectionsWithComponents = sections.map((section) => ({
    ...section,
    components: components.filter((component) => component.section_id === section.id),
  }));

  return {
    org: { ...org, id: orgId, name: org.name ?? "", slug: org.slug ?? "" },
    profile: profileRow
      ? {
          ...profileRow,
          logo_url: resolve(profileRow.logo_url),
          hero_image_url: resolve(profileRow.hero_image_url),
          // Revora's own inbox is never shown as a customer's business email.
          ...("email" in profileRow
            ? { email: customerBusinessEmail((profileRow as { email?: unknown }).email, orgId) }
            : {}),
        }
      : null,
    // Platform UI wording saved as a service ("Build my site", "All") never
    // reaches a visitor; real services are untouched.
    services: sanitizeServices(services.data ?? []),
    // Site-wide SEO and page settings also come from the published copy, so
    // a draft edit to them never reaches visitors before Publish.
    settings:
      live && settings.data
        ? {
            ...settings.data,
            seo: (live.seo ?? settings.data.seo) as typeof settings.data.seo,
            generation: (live.generation ?? settings.data.generation) as typeof settings.data.generation,
            pages: (live.settingsPages ?? settings.data.pages) as typeof settings.data.pages,
          }
        : settings.data,
    social: social.data,
    reviews: (reviews.data ?? []).map((r) => ({
      id: r.id as string,
      author_name: r.author_name ?? "",
      rating: r.rating ?? 5,
      comment: r.comment,
      created_at: r.created_at as string,
    })),
    gallery: gallery.map((g) => ({ ...g, url: resolve(g.url) ?? g.url })),
    quote: quoteForm.data ? { form: quoteForm.data, questions, addons } : null,
    content: currentPage
      ? { page: { ...currentPage, og_image_url: resolve(currentPage.og_image_url) }, sections: sectionsWithComponents }
      : null,
    nav: (navRows ?? [])
      .filter((row) => !row.noindex || row.kind !== "thanks")
      .filter((row) => populatedPages.has(row.id as string) || row.kind === "home"),

    pageFound: options?.pageSlug ? !!currentPage : true,

    publishState: gate?.publish_state ?? "draft",
  };
}

/**
 * Validates a shareable preview token. Returns the organisation slug only when
 * the link exists, has not been revoked and has not expired.
 */
export async function resolvePreviewToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin
    .from("website_preview_links")
    .select("id, organization_id, expires_at, revoked, views, label")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { ok: false as const, reason: "unknown" as const };
  if (link.revoked) return { ok: false as const, reason: "revoked" as const };
  if (new Date(link.expires_at).getTime() <= Date.now())
    return { ok: false as const, reason: "expired" as const };

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("slug")
    .eq("id", link.organization_id)
    .maybeSingle();
  if (!org?.slug) return { ok: false as const, reason: "unknown" as const };

  await supabaseAdmin
    .from("website_preview_links")
    .update({ views: Number(link.views ?? 0) + 1, last_viewed_at: new Date().toISOString() })
    .eq("id", link.id);

  return {
    ok: true as const,
    slug: org.slug,
    organizationId: link.organization_id as string,
    expiresAt: link.expires_at,
    label: link.label,
  };
}
