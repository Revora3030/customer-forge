/**
 * Live-sync comparison: does every saved builder change actually reach the
 * website a visitor sees?
 *
 * The builder writes pages, sections and items to the workspace. The public
 * site reads the same rows back through the visitor-facing projection, which
 * applies its own rules: the site must be published, and every page, section
 * and item must be switched on. Anything switched off, or filtered out for a
 * reason the owner cannot see, silently never appears — and until now nothing
 * told the owner.
 *
 * This module is pure so it can be unit tested: it takes the builder's own
 * tree plus the exact structure the visitor read returned, and reports what is
 * live, what is deliberately switched off, and what was saved but is not
 * reaching visitors. It never guesses a cause it cannot see in the two inputs.
 */

export type BuilderItem = { id: string; label: string; visible: boolean };
export type BuilderSection = {
  id: string;
  label: string;
  visible: boolean;
  items: BuilderItem[];
};
export type BuilderPage = {
  id: string;
  slug: string;
  title: string;
  visible: boolean;
  sections: BuilderSection[];
};

/** What the visitor-facing read actually returned for one page. */
export type VisitorPage = {
  slug: string;
  sectionIds: string[];
  itemIds: string[];
};

export type SyncIssue = {
  scope: "site" | "page" | "section" | "item";
  /** Page the piece belongs to, in the owner's words. */
  page: string;
  label: string;
  /** What is happening, plainly. */
  why: string;
  /** The one thing the owner can do about it. */
  fix: string;
};

export type SyncResult = {
  published: boolean;
  /** True only when every switched-on piece was found in the visitor read. */
  allLive: boolean;
  /** Pieces a visitor can see right now. */
  live: number;
  /** Pieces deliberately switched off by the owner. */
  hidden: number;
  /** Pieces saved and switched on that visitors still cannot see. */
  missing: number;
  issues: SyncIssue[];
  /** Switched-off pieces, listed separately: these are choices, not faults. */
  hiddenNotes: SyncIssue[];
};

function label(value: string | null | undefined, fallback: string): string {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 80) : fallback;
}

export function compareLiveSync(input: {
  publishState: string | null | undefined;
  builderPages: readonly BuilderPage[];
  visitorPages: readonly VisitorPage[];
}): SyncResult {
  const published = input.publishState === "published";
  const issues: SyncIssue[] = [];
  const hiddenNotes: SyncIssue[] = [];
  let live = 0;
  let hidden = 0;
  let missing = 0;

  const visitorBySlug = new Map(input.visitorPages.map((page) => [page.slug, page]));

  if (!published) {
    issues.push({
      scope: "site",
      page: "Whole site",
      label: "Site is not live yet",
      why: "Your changes are saved, but the site is not published, so no visitor can see them.",
      fix: "Open Publish and put the site live.",
    });
  }

  for (const page of input.builderPages) {
    const pageName = label(page.title, page.slug || "Page");

    if (!page.visible) {
      hidden += 1;
      hiddenNotes.push({
        scope: "page",
        page: pageName,
        label: "Page switched off",
        why: "This page is switched off, so it is not part of your site.",
        fix: "Switch the page back on in Pages if you want visitors to see it.",
      });
      continue;
    }

    const visitorPage = published ? visitorBySlug.get(page.slug) : undefined;
    if (published && !visitorPage) {
      missing += 1;
      issues.push({
        scope: "page",
        page: pageName,
        label: "Page not reaching visitors",
        why: "This page is switched on and saved, but the live site did not return it.",
        fix: "Check the page has at least one switched-on section, then run this check again.",
      });
      continue;
    }
    if (published) live += 1;

    const liveSections = new Set(visitorPage?.sectionIds ?? []);
    const liveItems = new Set(visitorPage?.itemIds ?? []);

    for (const section of page.sections) {
      const sectionName = label(section.label, section.id);
      if (!section.visible) {
        hidden += 1;
        hiddenNotes.push({
          scope: "section",
          page: pageName,
          label: `${sectionName} is switched off`,
          why: "This section is hidden, so visitors never see it.",
          fix: "Switch the section back on to show it.",
        });
        continue;
      }
      if (published && !liveSections.has(section.id)) {
        missing += 1;
        issues.push({
          scope: "section",
          page: pageName,
          label: `${sectionName} not reaching visitors`,
          why: "This section is saved and switched on, but the live site did not return it.",
          fix: "Re-save the section, then run this check again.",
        });
        continue;
      }
      if (published) live += 1;

      for (const item of section.items) {
        const itemName = label(item.label, item.id);
        if (!item.visible) {
          hidden += 1;
          hiddenNotes.push({
            scope: "item",
            page: pageName,
            label: `${itemName} is switched off`,
            why: "This item is hidden inside its section.",
            fix: "Switch the item back on to show it.",
          });
          continue;
        }
        if (published && !liveItems.has(item.id)) {
          missing += 1;
          issues.push({
            scope: "item",
            page: pageName,
            label: `${itemName} not reaching visitors`,
            why: "This item is saved and switched on, but the live site did not return it.",
            fix: "Re-save the item, then run this check again.",
          });
          continue;
        }
        if (published) live += 1;
      }
    }
  }

  return {
    published,
    allLive: published && missing === 0,
    live,
    hidden,
    missing,
    issues,
    hiddenNotes,
  };
}

/** One plain sentence for the panel header. */
export function syncSummary(result: SyncResult): string {
  if (!result.published) return "Saved, but not live yet — nothing is visible to visitors.";
  if (result.missing > 0) {
    return `${result.missing} saved ${result.missing === 1 ? "change is" : "changes are"} not reaching your live site.`;
  }
  return `Every saved change is live — ${result.live} ${result.live === 1 ? "piece" : "pieces"} checked on your real site.`;
}
