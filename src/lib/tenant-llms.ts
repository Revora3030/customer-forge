/**
 * Machine-readable business facts for one published client website:
 * `/llms.txt` (plain text for AI crawlers, https://llmstxt.org) and
 * `/brand-facts.json` (the same facts as JSON).
 *
 * Both are projections of the LocalBusiness record the page head already
 * publishes (`localBusinessSchema`), so they inherit its rules: only the
 * owner's verified profile, active services and own social links; placeholder
 * phones/emails and unknown fields are left out; ratings, reviews and awards
 * are never emitted. Nothing here calls a model or invents a fact.
 *
 * Pure and dependency-light, so it runs unchanged during SSR on Workers.
 */
import { localBusinessSchema } from "@/lib/site-head";

type FactsProfile = Parameters<typeof localBusinessSchema>[0]["profile"];
type FactsService = NonNullable<Parameters<typeof localBusinessSchema>[0]["services"]>[number];
type FactsSocial = Parameters<typeof localBusinessSchema>[0]["social"];

export const BRAND_FACTS_VERSION = 1;

export type BrandFactsInput = {
  name: string;
  /** Canonical home URL of the site (custom domain, else /s/<slug>), no trailing slash. */
  siteUrl: string;
  industry?: string | null;
  profile: FactsProfile;
  services?: FactsService[] | null;
  social?: FactsSocial;
  /** Published, indexable inner page slugs (the sitemap list). */
  pageSlugs?: readonly string[];
  publishedAt?: string | null;
};

export type BrandFacts = {
  version: typeof BRAND_FACTS_VERSION;
  name: string;
  url: string;
  type: string | string[];
  description?: string;
  telephone?: string;
  email?: string;
  address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string };
  areaServed?: string;
  openingHours?: { days: string[]; opens: string; closes: string }[];
  priceRange?: string;
  sameAs?: string[];
  services: { name: string; description?: string; price?: string; startingPrice?: string; currency?: "USD" }[];
  pages: { url: string }[];
  updatedAt: string | null;
  source: string;
};

const SOURCE_NOTE =
  "Published by the business on its own website from its verified profile. Unknown details are omitted rather than guessed; no ratings or reviews are included.";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function pagePath(slug: string): string | null {
  return /^[a-z0-9-]{1,80}$/.test(slug) ? `/${slug}` : null;
}

/** The verified facts behind one site, as a stable JSON shape. */
export function tenantBrandFacts(input: BrandFactsInput): BrandFacts {
  const siteUrl = input.siteUrl.replace(/\/+$/, "");
  const schema = localBusinessSchema({
    name: input.name,
    url: siteUrl,
    profile: input.profile,
    services: input.services ?? [],
    industry: input.industry ?? null,
    social: input.social,
  });

  const address = schema["address"] as Record<string, unknown> | undefined;
  const hours = (schema["openingHoursSpecification"] as Record<string, unknown>[] | undefined) ?? [];
  const catalog = schema["hasOfferCatalog"] as { itemListElement?: Record<string, unknown>[] } | undefined;

  const facts: BrandFacts = {
    version: BRAND_FACTS_VERSION,
    name: input.name,
    url: siteUrl,
    type: schema["@type"] as string | string[],
    services: (catalog?.itemListElement ?? []).flatMap((offer) => {
      const item = offer["itemOffered"] as Record<string, unknown> | undefined;
      const name = str(item?.["name"]);
      if (!name) return [];
      const spec = offer["priceSpecification"] as Record<string, unknown> | undefined;
      const price = str(offer["price"]);
      const startingPrice = str(spec?.["minPrice"]);
      return [{
        name,
        ...(str(item?.["description"]) ? { description: str(item?.["description"]) } : {}),
        ...(price ? { price } : {}),
        ...(startingPrice ? { startingPrice } : {}),
        ...(price || startingPrice ? { currency: "USD" as const } : {}),
      }];
    }),
    pages: [
      { url: `${siteUrl}/` },
      ...[...new Set(input.pageSlugs ?? [])]
        .map(pagePath)
        .filter((path): path is string => !!path)
        .map((path) => ({ url: `${siteUrl}${path}` })),
    ],
    updatedAt: input.publishedAt ?? null,
    source: SOURCE_NOTE,
  };
  if (str(schema["description"])) facts.description = schema["description"] as string;
  if (str(schema["telephone"])) facts.telephone = schema["telephone"] as string;
  if (str(schema["email"])) facts.email = schema["email"] as string;
  if (address) {
    const out: NonNullable<BrandFacts["address"]> = {};
    for (const key of ["streetAddress", "addressLocality", "addressRegion", "postalCode"] as const) {
      const value = str(address[key]);
      if (value) out[key] = value;
    }
    if (Object.keys(out).length) facts.address = out;
  }
  if (str(schema["areaServed"])) facts.areaServed = schema["areaServed"] as string;
  const openingHours = hours.flatMap((spec) => {
    const days = Array.isArray(spec["dayOfWeek"]) ? (spec["dayOfWeek"] as unknown[]).filter((d): d is string => typeof d === "string") : str(spec["dayOfWeek"]) ? [spec["dayOfWeek"] as string] : [];
    const opens = str(spec["opens"]);
    const closes = str(spec["closes"]);
    return days.length && opens && closes ? [{ days, opens, closes }] : [];
  });
  if (openingHours.length) facts.openingHours = openingHours;
  if (str(schema["priceRange"])) facts.priceRange = schema["priceRange"] as string;
  if (Array.isArray(schema["sameAs"]) && (schema["sameAs"] as unknown[]).length) facts.sameAs = schema["sameAs"] as string[];
  return facts;
}

/** One line of owner text, safe inside a Markdown list or blockquote. */
function line(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function money(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `$${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)}` : value;
}

/** llms.txt for one site, rendered only from {@link tenantBrandFacts}. */
export function tenantLlmsTxt(facts: BrandFacts): string {
  const out: string[] = [`# ${line(facts.name)}`, ""];
  if (facts.description) out.push(`> ${line(facts.description)}`, "");

  const details: string[] = [];
  const type = Array.isArray(facts.type) ? facts.type.join(", ") : facts.type;
  if (type && type !== "LocalBusiness") details.push(`- Business type: ${type}`);
  if (facts.telephone) details.push(`- Phone: ${line(facts.telephone)}`);
  if (facts.email) details.push(`- Email: ${line(facts.email)}`);
  if (facts.address) {
    const a = facts.address;
    details.push(`- Address: ${line([a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "))}`);
  }
  if (facts.areaServed) details.push(`- Service area: ${line(facts.areaServed)}`);
  for (const h of facts.openingHours ?? []) details.push(`- Hours: ${h.days.join(", ")} ${h.opens}–${h.closes}`);
  if (facts.priceRange) details.push(`- Price range: ${facts.priceRange}`);
  if (details.length) out.push("## Business details", ...details, "");

  if (facts.services.length) {
    out.push("## Services");
    for (const s of facts.services) {
      const price = s.price ? ` (${money(s.price)})` : s.startingPrice ? ` (from ${money(s.startingPrice)})` : "";
      out.push(`- ${line(s.name)}${price}${s.description ? `: ${line(s.description)}` : ""}`);
    }
    out.push("");
  }

  out.push("## Pages");
  for (const page of facts.pages) out.push(`- ${page.url}`);
  out.push("");

  if (facts.sameAs?.length) {
    out.push("## Official profiles", ...facts.sameAs.map((url) => `- ${url}`), "");
  }

  out.push("## Machine-readable facts", `- ${facts.url}/brand-facts.json`, `- ${facts.url}/sitemap.xml`, "");
  if (facts.updatedAt) out.push(`Last published: ${facts.updatedAt}`, "");
  return out.join("\n");
}
