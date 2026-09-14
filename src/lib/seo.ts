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
  telephone: BUSINESS.tel,
  email: BUSINESS.email,
  description:
    "Revora builds local service businesses a complete customer acquisition system: website, lead capture, CRM, quotes, booking, follow-up, reviews, local SEO and analytics.",
  founder: { "@type": "Person", name: REVORA.founder.name },
  areaServed: BUSINESS.areasServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      email: BUSINESS.email,
      telephone: BUSINESS.tel,
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
  telephone: BUSINESS.tel,
  email: BUSINESS.email,
  image: `${SITE_URL}/favicon.png`,
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
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59",
    },
  ],
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
  serviceType: "Customer acquisition system for local service businesses",
  provider: { "@id": `${SITE_URL}/#organization` },
  areaServed: BUSINESS.areasServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  description:
    "A complete done-for-you customer acquisition system: lead-generating website, lead capture, CRM, instant quotes, online booking, automated follow-up, review requests, local SEO and analytics.",
  url: absoluteUrl("/pricing"),
  offers: [
    {
      "@type": "Offer",
      name: "One-time setup",
      price: GROWTH_SYSTEM.setupPrice,
      category: "Service",
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
