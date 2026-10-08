/**
 * Keeps every button and menu link on a site connected to a real page.
 *
 * Runs after a first build and after every builder change:
 * - every AI layout's buttons/links are checked and broken ones repointed to
 *   the closest real page (see `link-integrity.ts`);
 * - the AI menu and footer get any page that is missing from them (a page added
 *   in the chat), and lose dead links to removed pages;
 * - old-style link components get the same treatment.
 * Only links change; design and wording are never touched. Failures are
 * reported, never thrown, so this can never block a build or an edit.
 */
import {
  readComposition,
  writeComposition,
  validateComposition,
} from "@/lib/builder/composition-tree";
import { readSiteChrome, writeSiteChrome } from "@/lib/builder/site-chrome";
import { safeLinkUrl, pageNavLabel } from "@/lib/website-content";
import { ensureHeaderAction } from "@/lib/builder/chrome-repair";
import {
  addMissingNavLinks,
  collectAnchors,
  enquiryPage,
  repairHref,
  repairTreeLinks,
  type SitePage,
} from "@/lib/builder/link-integrity";

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type LinkIntegrityReport = {
  /** True when a menu bar without an action button was given one. */
  headerActionAdded?: boolean;
  sectionsFixed: number;
  componentsFixed: number;
  menuLinksAdded: string[];
  chromeLinksFixed: number;
  errors: string[];
};

export async function ensureLinkIntegrity(
  db: Db,
  organizationId: string,
): Promise<LinkIntegrityReport> {
  const report: LinkIntegrityReport = {
    sectionsFixed: 0,
    componentsFixed: 0,
    menuLinksAdded: [],
    chromeLinksFixed: 0,
    errors: [],
  };
  try {
    const [pagesRes, sectionsRes, componentsRes, settingsRes, orgRes] = await Promise.all([
      db
        .from("website_pages")
        .select("id,slug,kind,title,is_visible")
        .eq("organization_id", organizationId)
        .order("sort_order"),
      db
        .from("website_sections")
        .select("id,page_id,kind,settings")
        .eq("organization_id", organizationId),
      db.from("website_components").select("id,link_url").eq("organization_id", organizationId),
      db
        .from("website_settings")
        .select("generation")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    ]);
    const contactRes = await db
      .from("business_profiles")
      .select("phone")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (pagesRes.error) throw new Error(pagesRes.error.message);
    const pageRows = (pagesRes.data ?? []) as (SitePage & {
      id: string;
      is_visible?: boolean | null;
    })[];
    // Hidden pages are not linkable for visitors.
    const pages: SitePage[] = pageRows.filter((p) => p.is_visible !== false);
    const sections = (sectionsRes.data ?? []) as {
      id: string;
      page_id: string;
      kind: string;
      settings: unknown;
    }[];
    const anchors = collectAnchors(sections);

    // 1. Buttons and links inside every AI layout.
    for (const section of sections) {
      const tree = readComposition(section.settings);
      if (!tree) continue;
      const { tree: fixed, fixes } = repairTreeLinks(tree, pages, anchors);
      if (!fixes.length) continue;
      if (!validateComposition(fixed, { lenient: true }).ok) continue;
      const { error } = await db
        .from("website_sections")
        .update({ settings: writeComposition(section.settings, fixed) } as never)
        .eq("id", section.id)
        .eq("organization_id", organizationId);
      if (error) report.errors.push(`section ${section.id}: ${error.message}`);
      else report.sectionsFixed += 1;
    }

    // 2. Old-style link components.
    for (const component of (componentsRes.data ?? []) as {
      id: string;
      link_url: string | null;
    }[]) {
      if (!component.link_url) continue;
      const to = repairHref(component.link_url, pages, anchors);
      if (!to || to === component.link_url) continue;
      const { error } = await db
        .from("website_components")
        .update({ link_url: safeLinkUrl(to) } as never)
        .eq("id", component.id)
        .eq("organization_id", organizationId);
      if (error) report.errors.push(`component ${component.id}: ${error.message}`);
      else report.componentsFixed += 1;
    }

    // 3. The AI menu and footer: every real page listed, no dead links.
    const generation = settingsRes.data?.generation ?? null;
    const chrome = readSiteChrome(generation);
    if (chrome.header && chrome.footer) {
      const name = String(orgRes.data?.name ?? "");
      const navPages = pages
        .filter((p) => p.kind !== "thanks" && p.kind !== "post")
        .map((p) => ({
          href: p.slug === "home" ? "/" : `/${p.slug}`,
          title: p.slug === "home" ? "Home" : pageNavLabel(p.title ?? p.slug, name, p.slug),
        }));
      let header = chrome.header;
      let footer = chrome.footer;
      const h1 = repairTreeLinks(header, pages, anchors);
      const f1 = repairTreeLinks(footer, pages, anchors);
      header = h1.tree;
      footer = f1.tree;
      report.chromeLinksFixed = h1.fixes.length + f1.fixes.length;
      const h2 = addMissingNavLinks(header, navPages);
      const f2 = addMissingNavLinks(footer, navPages);
      header = h2.tree;
      footer = f2.tree;
      report.menuLinksAdded = [...new Set([...h2.added, ...f2.added])];
      // A menu bar with no action button (older designs) gets one: the AI's
      // own contact link is promoted, or a button to the real contact page.
      const enquiry = enquiryPage(pages);
      const action = ensureHeaderAction(header, {
        enquiryHref: enquiry,
        enquiryTitle: enquiry ? navPages.find((p) => p.href === enquiry)?.title ?? null : null,
        phone: (contactRes?.data as { phone?: string | null } | null)?.phone ?? null,
      });
      header = action.tree;
      report.headerActionAdded = action.changed !== "none";
      const changed =
        report.chromeLinksFixed > 0 || h2.added.length > 0 || f2.added.length > 0 || action.changed !== "none";
      if (
        changed &&
        validateComposition(header, { lenient: true }).ok &&
        validateComposition(footer, { lenient: true }).ok
      ) {
        const { error } = await db
          .from("website_settings")
          .update({ generation: writeSiteChrome(generation, { header, footer }) } as never)
          .eq("organization_id", organizationId);
        if (error) report.errors.push(`menu: ${error.message}`);
      }
    }
  } catch (error) {
    report.errors.push((error as Error)?.message ?? String(error));
  }
  if (report.errors.length) console.warn("[link-integrity]", report.errors.slice(0, 5).join(" | "));
  return report;
}
