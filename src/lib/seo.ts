/**
 * Shared search + social metadata helpers.
 *
 * Every public page self-references its own canonical URL and og:url so
 * crawlers and social platforms attribute the page's own title, description
 * and preview to the right address.
 */

import { GROWTH_SYSTEM } from "@/lib/offer";
import { REVORA } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-identity";
import { safeJsonLd } from "@/lib/json-ld";

export const SITE_URL = "https://revoragrowthsystems.com";

export function absoluteUrl(path: string) {
  if (!path || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** og:url meta entry for a page path. */
export function ogUrl(path: string) {
  return { property: "og:url", content: absoluteUrl(path) } as const;
}

/** og:image meta entries for the brand social card. */
export const OG_IMAGE = {
  url: absoluteUrl("/og.jpg"),
  width: 1200,
  height: 630,
  alt: "Revora — AI growth software that books local jobs 24/7",
} as const;

/**
 * Ready-to-spread meta entries that attach the brand social card to a public
 * marketing page's head. Leaf pages only — never the root head, so a client
 * website on a custom domain keeps its own share image.
 */
export const OG_IMAGE_META = [
  { property: "og:image", content: OG_IMAGE.url },
  { property: "og:image:width", content: String(OG_IMAGE.width) },
  { property: "og:image:height", content: String(OG_IMAGE.height) },
  { property: "og:image:alt", content: OG_IMAGE.alt },
  { name: "twitter:image", content: OG_IMAGE.url },
] as const;

/** canonical link entry for a page path. */
export function canonicalLink(path: string) {
  return { rel: "canonical", href: absoluteUrl(path) } as const;
}

/** Sitewide publisher identity, referenced by page-level schemas. */
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: BUSINESS.legalName,
  legalName: BUSINESS.legalName,
  url: SITE_URL,
  // Google needs a crawlable, at least 112px square logo for the knowledge panel.
  logo: { "@type": "ImageObject", url: absoluteUrl("/apple-touch-icon.png"), width: 180, height: 180 },
  email: BUSINESS.email,
  description:
    "Revora builds businesses in every industry a complete customer acquisition system: website, lead capture, CRM, quotes, booking, follow-up, reviews, local SEO and analytics.",
  founder: { "@type": "Person", name: REVORA.founder.name },
  areaServed: BUSINESS.areasServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      email: BUSINESS.email,
      availableLanguage: BUSINESS.languages,
      areaServed: ["US", "Worldwide"],
      hoursAvailable: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "00:00",
        closes: "23:59",
      },
    },
  ],
};

/**
 * The business entity Google uses for the knowledge panel and local results:
 * name, phone, email, 24/7 hours and the areas served.
 *
 * Revora is a service-area business with no public street address, so no
 * `address.streetAddress` is emitted — only the region it is based in. Never
 * invent a street address here: an unverifiable address is a listing risk.
 */
export const LOCAL_BUSINESS_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${SITE_URL}/#business`,
  name: BUSINESS.displayName,
  legalName: BUSINESS.legalName,
  url: SITE_URL,
  email: BUSINESS.email,
  // The 1200x630 social card; the 64px favicon is too small for rich results.
  image: OG_IMAGE.url,
  logo: absoluteUrl("/apple-touch-icon.png"),
  priceRange: BUSINESS.priceRange,
  currenciesAccepted: "USD",
  paymentAccepted: "Credit Card, Debit Card, Apple Pay, Google Pay",
  founder: { "@type": "Person", name: BUSINESS.founder },
  parentOrganization: { "@id": `${SITE_URL}/#organization` },
  address: {
    "@type": "PostalAddress",
    addressRegion: BUSINESS.region.code,
    addressCountry: BUSINESS.region.country,
  },
  areaServed: BUSINESS.areasServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  serviceType: "Website design, lead generation and customer acquisition systems",
  knowsLanguage: BUSINESS.languages,
  // No openingHoursSpecification: Revora is a remote business, and claiming it is
  // open 24/7 is misleading structured data.
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Revora Growth System",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Lead-generating business website",
          description:
            "A conversion-built website with services, pricing, instant quotes and online booking.",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Lead capture and CRM",
          description:
            "Every enquiry captured into one pipeline with automated first reply and follow-up.",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Online booking and quotes",
          description: "Real-time booking on your availability plus instant on-site quotes.",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Local SEO and analytics",
          description:
            "Local search pages, structured data and reporting on which channels produce paying customers.",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Review generation",
          description: "Automated review requests after every completed job.",
        },
      },
    ],
  },
};

/** Sitewide site entity, including the in-site search action. */
export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: BUSINESS.displayName,
  inLanguage: "en",
  publisher: { "@id": `${SITE_URL}/#organization` },
};

/**
 * The single canonical offer, expressed for search engines.
 *
 * Revora sells a done-for-you service, not a retail product, so this is a
 * `Service` with real service offers — no Merchant Listing Product schema, no
 * invented SKU/GTIN, shipping, returns, inventory, reviews or ratings.
 */
export const GROWTH_SYSTEM_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: GROWTH_SYSTEM.name,
  "@id": `${SITE_URL}/#growth-system`,
  serviceType: "Customer acquisition system for businesses",
  provider: { "@id": `${SITE_URL}/#organization` },
  areaServed: BUSINESS.areasServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  description:
    "A complete done-for-you customer acquisition system: lead-generating website, lead capture, CRM, instant quotes, online booking, automated follow-up, review requests, local SEO and analytics.",
  url: absoluteUrl("/pricing"),
  offers: [
    {
      "@type": "Offer",
      name: "One-time setup",
      description: "Charged once, at checkout. Free access before checkout needs no card.",
      price: GROWTH_SYSTEM.setupPrice,
      category: "Service",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/pricing"),
    },
    {
      "@type": "Offer",
      name: "First month free",
      description: `The platform subscription costs nothing for the first ${GROWTH_SYSTEM.trialDays} days after setup.`,
      price: 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/pricing"),
    },
    {
      "@type": "Offer",
      name: "Platform subscription",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/pricing"),
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: GROWTH_SYSTEM.monthlyPrice,
        priceCurrency: "USD",
        unitText: "MONTH",
        billingIncrement: 1,
      },
    },
  ],
};

/**
 * FAQPage built from the exact question/answer list a page renders, so the
 * structured data and the visible FAQ can never drift apart.
 */
export function faqPageSchema(items: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** A <head> JSON-LD script entry, escaped so text can never close the tag. */
export function jsonLdScript(schema: unknown) {
  return { type: "application/ld+json" as const, children: safeJsonLd(schema) };
}

/** Breadcrumbs help search engines understand deep pages. */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * Search results truncate descriptions at roughly 155-160 characters. Copy
 * that is longer is cut so it still reads as finished text, never as a
 * dangling "…": at the last full sentence when that keeps most of the
 * budget, otherwise at the last word boundary. Open Graph descriptions can
 * stay full-length.
 */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max + 1);
  // Last sentence that ends inside the budget ("... /mo." or "...!" or "...?").
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (sentenceEnd >= max * 0.6) return window.slice(0, sentenceEnd + 1);
  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? window.slice(0, lastSpace) : clean.slice(0, max);
  return cut.replace(/[\s,;:—–-]+$/, "").replace(/\b(and|or|with|for|to|in|of|the|a|an|then)$/i, "").replace(/[\s,;:—–-]+$/, "");
}

export const BRAND_NAME = "Revora Growth Systems";

/**
 * "<core> | Revora Growth Systems", falling back to "| Revora" and finally to
 * the bare core when the full brand would push the title past `max`
 * characters (Google cuts titles at about 60). The core is never cut unless
 * it is too long by itself, and then only at a word boundary.
 */
export function brandedTitle(core: string, max = 60): string {
  const clean = core.replace(/\s+/g, " ").trim();
  for (const brand of [BRAND_NAME, "Revora"]) {
    const title = `${clean} | ${brand}`;
    if (title.length <= max) return title;
  }
  return metaTitle(clean, "", max);
}

/**
 * True when a router match renders a client's website, so the root head must
 * not stamp Revora's own share image, Organization/WebSite records, site
 * verification or Ads consent script onto it. Any public route whose loader
 * returned a client `site` counts (custom-domain /about, /contact and
 * /pricing included). The signed-in builder's private draft frame stays a
 * Revora app surface.
 */
export function isClientSiteMatch(match: { routeId?: unknown; loaderData?: unknown }): boolean {
  const routeId = String(match.routeId ?? "");
  if (/^\/(s|p)\/\$/.test(routeId)) return true;
  if (routeId.startsWith("/_authenticated")) return false;
  const data = match.loaderData as { site?: unknown; pending?: boolean } | null | undefined;
  if (!data || typeof data !== "object") return false;
  if (data.site) return true;
  // A client's custom domain whose site is not published yet.
  return (routeId === "/" || routeId === "/$") && data.pending === true;
}

const escapeRegExp =(value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A search title that fits the result line. The wording is the AI- or
 * owner-authored title; this only makes it safe to show:
 *
 * - a doubled business-name suffix ("Services — Acme — Acme") collapses to one;
 * - a trailing " — Acme" / " | Acme" is dropped when the name already appears
 *   earlier in the title;
 * - a title over `max` characters is cut at the last word boundary that fits,
 *   never in the middle of a word.
 */
export function metaTitle(raw: string, businessName: string, max = 60): string {
  let title = raw.replace(/\s+/g, " ").trim();
  const name = businessName.replace(/\s+/g, " ").trim();
  if (name) {
    const sep = String.raw`\s*[—–|-]\s*`;
    const quoted = escapeRegExp(name);
    // " — Name — Name" (any number of repeats) → " — Name".
    title = title.replace(new RegExp(`(?:${sep}${quoted}){2,}$`, "i"), (match) => {
      const first = new RegExp(`^${sep}${quoted}`, "i").exec(match);
      return first ? first[0] : match;
    });
    // "Name Services — Name" → "Name Services".
    const suffix = new RegExp(`${sep}${quoted}$`, "i").exec(title);
    if (suffix && suffix.index > 0) {
      const head = title.slice(0, suffix.index);
      if (head.toLowerCase().includes(name.toLowerCase())) title = head.trim();
    }
  }
  if (title.length <= max) return title;
  const window = title.slice(0, max + 1);
  const lastSpace = window.lastIndexOf(" ");
  // A single word longer than the limit has no boundary to cut at.
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : title.slice(0, max);
  return cut.replace(/[\s,;:|—–-]+$/, "").trim();
}
