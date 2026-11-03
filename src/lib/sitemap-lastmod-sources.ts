/**
 * Which source files date which sitemap paths. Pure (no imports) so the
 * generator script can read it without loading the generated table.
 */

/** Source files whose last git change dates each group of pages. */
export const LASTMOD_SOURCE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  home: ["src/routes/index.tsx", "src/lib/marketing-seo.ts"],
  pricing: ["src/routes/pricing.tsx", "src/lib/offer.ts"],
  "get-started": ["src/routes/get-started.tsx", "src/lib/offer.ts"],
  "crm-for-contractors": ["src/routes/crm-for-contractors.tsx"],
  "crm-hub": ["src/routes/crm.index.tsx", "src/lib/crm-solutions.ts"],
  "crm-page": ["src/routes/crm.$trade.tsx"],
  "website-audit": ["src/routes/website-audit.tsx"],
  "growth-assessment": ["src/routes/growth-assessment.tsx"],
  tools: ["src/routes/tools.tsx"],
  "industries-hub": ["src/routes/industries.index.tsx", "src/lib/domain.ts"],
  "industries-page": ["src/routes/industries.$slug.tsx", "src/lib/domain.ts"],
  "local-hub": ["src/routes/local.index.tsx", "src/lib/local-pages.ts"],
  "local-trade-hub": ["src/routes/local.$industry.index.tsx", "src/lib/local-pages.ts"],
  "local-page": ["src/routes/local.$industry.$state.tsx", "src/lib/local-pages.ts"],
  "locations-hub": ["src/routes/locations.index.tsx", "src/lib/business-identity.ts"],
  "locations-page": ["src/routes/locations.$city.tsx", "src/lib/business-identity.ts"],
  "states-hub": ["src/routes/states.index.tsx", "src/lib/us-states.ts"],
  "states-page": ["src/routes/states.$state.tsx", "src/lib/us-states.ts"],
  "guides-hub": ["src/routes/guides.index.tsx", "src/lib/guides.ts"],
  "compare-hub": ["src/routes/compare.index.tsx", "src/content/seo/compare/index.md"],
  "compare-page": ["src/routes/compare.$slug.tsx", "src/lib/compare.ts"],
  about: ["src/routes/about.tsx", "src/lib/marketing-seo.ts"],
  contact: ["src/routes/contact.tsx"],
  privacy: ["src/routes/privacy.tsx"],
  terms: ["src/routes/terms.tsx"],
};

const STATIC_GROUPS: Readonly<Record<string, string>> = {
  "": "home",
  "/pricing": "pricing",
  "/get-started": "get-started",
  "/crm-for-contractors": "crm-for-contractors",
  "/crm": "crm-hub",
  "/website-audit": "website-audit",
  "/growth-assessment": "growth-assessment",
  "/tools": "tools",
  "/industries": "industries-hub",
  "/local": "local-hub",
  "/locations": "locations-hub",
  "/states": "states-hub",
  "/guides": "guides-hub",
  "/compare": "compare-hub",
  "/about": "about",
  "/contact": "contact",
  "/privacy": "privacy",
  "/terms": "terms",
};

/** The group a sitemap path belongs to, or null when it is not one we know. */
export function lastmodGroupFor(path: string): string | null {
  const p = path === "/" ? "" : path.replace(/\/+$/, "");
  const fixed = STATIC_GROUPS[p];
  if (fixed !== undefined) return fixed;
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 2) {
    if (parts[0] === "crm") return "crm-page";
    if (parts[0] === "industries") return "industries-page";
    if (parts[0] === "locations") return "locations-page";
    if (parts[0] === "states") return "states-page";
    if (parts[0] === "compare") return "compare-page";
    if (parts[0] === "local") return "local-trade-hub";
  }
  if (parts.length === 3 && parts[0] === "local") return "local-page";
  return null;
}

/** The Markdown content file (relative to src/content/seo) behind a path. */
export function lastmodDocKeyFor(path: string): string | null {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] === "compare" && parts.length === 2) return `compare/${parts[1]}`;
  if (parts[0] === "local" && parts.length === 3) return `local/${parts[1]}-${parts[2]}`;
  return null;
}
