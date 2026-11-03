/**
 * "Bring your existing website": reads the facts a business already publishes
 * on its own site (name, phone, email, address, hours, services, logo, photo,
 * colors, social links, about text) so its Revora site starts from them.
 *
 * Pure and browser-safe: the server fetches the pages (site-import.server.ts)
 * and this turns HTML into facts. Only facts the page states are returned,
 * never guesses, and the owner reviews them before anything is saved. Copy
 * and creative choices for the new site are still written by the AI team.
 */

import { decodeHtmlEntities, htmlToText } from "@/lib/html-text";
import { checkServiceName } from "./builder/intake-sanitize";

export type ImportedService ={ name: string; description: string };

export type ImportedFacts = {
  businessName: string;
  about: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  hours: string;
  logoUrl: string;
  heroImageUrl: string;
  primaryColor: string;
  instagram: string;
  facebook: string;
  google: string;
  services: ImportedService[];
};

export const EMPTY_FACTS: ImportedFacts = {
  businessName: "",
  about: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  hours: "",
  logoUrl: "",
  heroImageUrl: "",
  primaryColor: "",
  instagram: "",
  facebook: "",
  google: "",
  services: [],
};

/** One decoding pass, so "&amp;lt;" reads as the text "&lt;", never "<". */
export function decodeEntities(text: string): string {
  return decodeHtmlEntities(text);
}

const clean = (text: string, max = 400) =>
  // Imported text is plain facts: after decoding entities, any angle bracket
  // left over (including a decoded "&lt;") is removed, never kept as markup.
  htmlToText(text).replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities((match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim());
}

function meta(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    if (name === key) return clean(attr(tag, "content"), 600);
  }
  return "";
}

export function absolute(href: string, base: string): string {
  if (!href.trim() || href.trim().startsWith("#") || /^data:/i.test(href.trim())) return "";
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

type JsonObject = Record<string, unknown>;

/** Longest JSON-LD script body read; anything bigger is not a business card. */
const MAX_JSON_LD_CHARS = 200_000;

/** Every JSON-LD node on one page, @graph members and nested arrays included. */
export function jsonLdNodes(html: string): JsonObject[] {
  const out: JsonObject[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || out.length > 200) return;
    if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1));
    else if (value && typeof value === "object") {
      const object = value as JsonObject;
      out.push(object);
      if (Array.isArray(object["@graph"])) visit(object["@graph"], depth + 1);
    }
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = (match[1] ?? "")
      .replace(/^\s*(?:<!--|\/\/\s*<!\[CDATA\[|<!\[CDATA\[)/, "")
      .replace(/(?:--!?>|\/\/\s*\]\]>|\]\]>)\s*$/, "")
      .trim();
    if (!body || body.length > MAX_JSON_LD_CHARS) continue;
    try {
      visit(JSON.parse(body), 0);
    } catch {
      /* broken JSON-LD on the customer's site is simply skipped */
    }
  }
  return out;
}

/** A specific kind of local business (Plumber, HVACBusiness, Dentist, ...). */
const SPECIFIC_BUSINESS =
  /LocalBusiness|Store|Contractor|Plumber|Electrician|Roofing|HVAC|Locksmith|Mover|Dentist|Physician|Clinic|Salon|Spa|Restaurant|Cafe|Bakery|Attorney|LegalService|Accounting|RealEstate|AutoRepair|AutoBody|Cleaning|HomeAndConstruction|Landscap|Painter|PestControl|Veterinar|Gym|Fitness|Photograph|Agency|ProfessionalService|EmergencyService|FinancialService|FoodEstablishment|HealthAndBeautyBusiness|MedicalBusiness|AutomotiveBusiness|HomeGoodsStore|ChildCare|LodgingBusiness|SportsActivityLocation|EntertainmentBusiness|Business$/i;
/** Types that describe an offering or a page, never the business itself. */
const NOT_A_BUSINESS = /^(Service|Offer|OfferCatalog|Product|WebSite|WebPage|BreadcrumbList|ListItem|ItemList|Review|AggregateRating|Rating|Person|ImageObject|VideoObject|FAQPage|Question|Answer|Article|BlogPosting|SearchAction|PostalAddress|GeoCoordinates|OpeningHoursSpecification|ContactPoint|Place|Event)$/i;

const typeList = (object: JsonObject) =>
  [object["@type"]].flat().map((type) => String(type ?? "").replace(/^https?:\/\/schema\.org\//i, "").trim()).filter(Boolean);

/** 2 for a specific local business, 1 for a plain Organization, 0 otherwise. */
export function businessRank(object: JsonObject): number {
  const kinds = typeList(object);
  if (!kinds.length || !object["name"]) return 0;
  if (kinds.some((kind) => SPECIFIC_BUSINESS.test(kind) && !NOT_A_BUSINESS.test(kind))) return 2;
  if (kinds.some((kind) => /^(Organization|Corporation|NGO)$/i.test(kind))) return 1;
  return 0;
}

const text = (value: unknown, max = 400): string => {
  if (typeof value === "string" || typeof value === "number") return clean(String(value), max);
  if (Array.isArray(value)) return text(value[0], max);
  return "";
};
const firstUrl = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstUrl(value[0]);
  if (value && typeof value === "object") return firstUrl((value as JsonObject)["url"] ?? (value as JsonObject)["contentUrl"]);
  return "";
};
const objectOf = (value: unknown): JsonObject => {
  const first = Array.isArray(value) ? value[0] : value;
  return first && typeof first === "object" ? (first as JsonObject) : {};
};

const PHONE = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;

export function formatPhone(raw: string): string {
  const match = raw.match(PHONE);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : "";
}

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

function hours(value: unknown): string {
  if (typeof value === "string") return clean(value, 200);
  if (!Array.isArray(value)) return "";
  const parts = value
    .map((item) => {
      if (typeof item === "string") return clean(item, 60);
      if (!item || typeof item !== "object") return "";
      const spec = item as JsonObject;
      const days = [spec["dayOfWeek"]].flat().map((day) => String(day ?? "").replace(/^https?:\/\/schema\.org\//, "")).filter(Boolean).join(", ");
      const opens = text(spec["opens"], 10);
      const closes = text(spec["closes"], 10);
      return days && opens && closes ? `${days} ${opens}–${closes}` : "";
    })
    .filter(Boolean);
  return parts.join("; ").slice(0, 300);
}

const SKIP_SERVICE = /^(home|about|about us|contact|contact us|blog|news|faq|faqs|reviews|testimonials|gallery|careers|login|log in|sign in|privacy|terms|book now|get a quote|free quote|call now|learn more|read more|menu|services|our services|all services)$/i;

function serviceName(raw: string): string {
  const name = clean(raw, 80).replace(/[|•–—-]\s*$/, "").trim();
  if (name.length < 3 || name.length > 60 || SKIP_SERVICE.test(name) || name.split(" ").length > 7) return "";
  if (/[@$]|https?:|\d{3}[\s.-]\d{4}/.test(name)) return "";
  return name;
}

/**
 * Facts from the Schema.org JSON-LD a business publishes on its OWN site
 * (LocalBusiness and its subtypes, or an Organization). Reads only the page it
 * is given: it never follows sameAs or any other link, and ratings or reviews
 * in the markup are never imported. Values are cleaned text, and the owner
 * reviews them before anything is saved (applyImportedFacts fills empty
 * fields only).
 */
export function extractJsonLdFacts(html: string, pageUrl: string): ImportedFacts {
  const facts: ImportedFacts = { ...EMPTY_FACTS, services: [] };
  const nodes = jsonLdNodes(html);
  let business: JsonObject | undefined;
  let best = 0;
  for (const node of nodes) {
    const rank = businessRank(node);
    if (rank > best) {
      best = rank;
      business = node;
    }
  }

  if (business) {
    facts.businessName = text(business["name"], 120);
    facts.about = text(business["description"], 800);
    const contact = objectOf(business["contactPoint"]);
    facts.phone = formatPhone(text(business["telephone"], 40) || text(contact["telephone"], 40));
    const email = (text(business["email"], 120) || text(contact["email"], 120)).replace(/^mailto:/i, "");
    facts.email = EMAIL.test(email) ? email : "";
    const rawAddress = Array.isArray(business["address"]) ? business["address"][0] : business["address"];
    if (typeof rawAddress === "string") {
      facts.address = clean(rawAddress, 240);
    } else {
      const address = objectOf(rawAddress);
      facts.city = text(address["addressLocality"], 80);
      facts.state = text(address["addressRegion"], 40);
      facts.address = [text(address["streetAddress"], 120), facts.city, [facts.state, text(address["postalCode"], 12)].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
    }
    facts.hours = hours(business["openingHoursSpecification"] ?? business["openingHours"]);
    facts.logoUrl = absolute(firstUrl(business["logo"]), pageUrl);
    facts.heroImageUrl = absolute(firstUrl(business["image"]), pageUrl);
    for (const link of [business["sameAs"]].flat()) {
      const url = typeof link === "string" ? link : "";
      if (/instagram\.com\//i.test(url)) facts.instagram ||= url;
      if (/facebook\.com\//i.test(url)) facts.facebook ||= url;
      if (/(google\.[a-z.]+\/maps|g\.page\/|maps\.app\.goo\.gl)/i.test(url)) facts.google ||= url;
    }
  }

  // Services: the business's offers and catalog (nested catalogs too), plus
  // standalone Service nodes on the page. Never a Product, rating or review.
  const offered: unknown[] = [];
  const walkCatalog = (catalog: unknown, depth: number) => {
    if (depth > 3) return;
    for (const entry of [objectOf(catalog)["itemListElement"]].flat()) {
      if (!entry || typeof entry !== "object") continue;
      if (typeList(entry as JsonObject).some((kind) => /^OfferCatalog$/i.test(kind))) walkCatalog(entry, depth + 1);
      else offered.push(entry);
    }
  };
  if (business) {
    offered.push(...[business["makesOffer"]].flat());
    walkCatalog(business["hasOfferCatalog"], 0);
  }
  for (const node of nodes) if (node !== business && typeList(node).some((kind) => /^Service$/i.test(kind))) offered.push(node);
  for (const offer of offered) {
    if (!offer || typeof offer !== "object") continue;
    const item = objectOf((offer as JsonObject)["itemOffered"] ?? offer);
    if (typeList(item).some((kind) => /^(Product|Review|AggregateRating)$/i.test(kind))) continue;
    const name = serviceName(text(item["name"], 80));
    if (name) facts.services.push({ name, description: text(item["description"], 300) });
  }
  return facts;
}

/** Facts from one page. Later pages only fill what earlier pages left empty. */
export function extractFacts(html: string, pageUrl: string): ImportedFacts & { links: string[] } {
  const facts: ImportedFacts = { ...EMPTY_FACTS, services: [] };
  Object.assign(facts, extractJsonLdFacts(html, pageUrl));
  facts.services = [...facts.services];

  facts.businessName ||= meta(html, "og:site_name") || clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 200).split(/\s[|–—-]\s/)[0]!.slice(0, 120);
  facts.about ||= meta(html, "description") || meta(html, "og:description");
  facts.heroImageUrl ||= absolute(meta(html, "og:image"), pageUrl);
  const theme = meta(html, "theme-color");
  facts.primaryColor = /^#[0-9a-f]{6}$/i.test(theme) ? theme.toLowerCase() : "";

  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const links: string[] = [];
  for (const [, attrs = "", inner = ""] of anchors) {
    const href = attr(`<a ${attrs}>`, "href");
    if (/^tel:/i.test(href)) facts.phone ||= formatPhone(href);
    else if (/^mailto:/i.test(href)) {
      const email = href.replace(/^mailto:/i, "").split("?")[0]!.trim();
      if (EMAIL.test(email)) facts.email ||= email;
    } else {
      const url = absolute(href, pageUrl);
      if (!url) continue;
      if (/instagram\.com\/[^/?#]+/i.test(url)) facts.instagram ||= url;
      else if (/facebook\.com\/[^/?#]+/i.test(url)) facts.facebook ||= url;
      else if (/(google\.[a-z.]+\/maps|g\.page\/|maps\.app\.goo\.gl)/i.test(url)) facts.google ||= url;
      links.push(url);
      // A link into a services section names a service.
      if (/\/(services?|what-we-do|our-work)\/[^/?#]+/i.test(new URL(url).pathname)) {
        const name = serviceName(inner);
        if (name) facts.services.push({ name, description: "" });
      }
    }
  }

  if (!facts.logoUrl) {
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
      const marker = `${attr(tag, "class")} ${attr(tag, "alt")} ${attr(tag, "src")} ${attr(tag, "id")}`;
      if (/logo/i.test(marker)) {
        facts.logoUrl = absolute(attr(tag, "src") || attr(tag, "data-src"), pageUrl);
        if (facts.logoUrl) break;
      }
    }
  }

  // Plain text: a phone number in the copy when there's no tel: link.
  // htmlToText already skips script, style, noscript, template and svg bodies.
  const body = clean(html, 200_000);
  facts.phone ||= formatPhone(body);

  // On a services page, short headings are service names.
  if (/\/(services?|what-we-do)\/?$/i.test(new URL(pageUrl).pathname)) {
    for (const match of html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
      const name = serviceName(match[1] ?? "");
      if (name) facts.services.push({ name, description: "" });
    }
  }

  // An about page's first substantial paragraph is a better summary than a meta tag.
  if (/\/(about|about-us|our-story|who-we-are)\/?$/i.test(new URL(pageUrl).pathname)) {
    const paragraph = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => clean(match[1] ?? "", 900)).find((value) => value.length >= 120);
    if (paragraph) facts.about = paragraph;
  }

  facts.services = dedupeServices(facts.services);
  return { ...facts, links };
}

function dedupeServices(services: ImportedService[]): ImportedService[] {
  const seen = new Map<string, ImportedService>();
  for (const service of services) {
    // A stub such as "Full" is not a service the owner can confirm; the owner adds the full name instead.
    if (!checkServiceName(service.name).ok) continue;
    const key = service.name.toLowerCase();
    const existing = seen.get(key);
    if (!existing) seen.set(key, service);
    else if (!existing.description && service.description) existing.description = service.description;
  }
  return [...seen.values()].slice(0, 12);
}

/**
 * Maps, review sites, directories and social networks. Their pages describe a
 * business but are not the owner's own site, and their terms forbid reading
 * them this way, so the importer refuses them (also after a redirect).
 */
const THIRD_PARTY_HOSTS = [
  /(^|\.)google\.[a-z.]+$/, /(^|\.)goo\.gl$/, /(^|\.)g\.page$/, /(^|\.)maps\.apple\.com$/, /(^|\.)bing\.com$/,
  /(^|\.)yelp\.[a-z.]+$/, /(^|\.)facebook\.com$/, /(^|\.)instagram\.com$/, /(^|\.)linkedin\.com$/, /(^|\.)nextdoor\.com$/,
  /(^|\.)angi\.com$/, /(^|\.)angieslist\.com$/, /(^|\.)homeadvisor\.com$/, /(^|\.)thumbtack\.com$/, /(^|\.)houzz\.com$/,
  /(^|\.)bbb\.org$/, /(^|\.)yellowpages\.com$/, /(^|\.)tripadvisor\.[a-z.]+$/, /(^|\.)mapquest\.com$/, /(^|\.)foursquare\.com$/,
  /(^|\.)x\.com$/, /(^|\.)twitter\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)porch\.com$/, /(^|\.)manta\.com$/,
];

export function isThirdPartySource(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  return THIRD_PARTY_HOSTS.some((pattern) => pattern.test(host));
}

/** Up to three same-site pages worth reading next: services, about, contact. */
export function nextPages(links: readonly string[], homeUrl: string): string[] {
  const home = new URL(homeUrl);
  const host = home.hostname.replace(/^www\./, "");
  const wanted: [RegExp, string | null][] = [
    [/\/(services?|what-we-do)\/?$/i, null],
    [/\/(about|about-us|our-story|who-we-are)\/?$/i, null],
    [/\/(contact|contact-us)\/?$/i, null],
  ];
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    if (url.hostname.replace(/^www\./, "") !== host) continue;
    url.hash = "";
    url.search = "";
    for (const entry of wanted) if (!entry[1] && entry[0].test(url.pathname)) entry[1] = url.toString();
  }
  return wanted.map((entry) => entry[1]).filter((value): value is string => Boolean(value) && value !== home.toString());
}

/** Combines pages: the first page that states a fact wins; services are pooled. */
export function mergeFacts(pages: readonly ImportedFacts[]): ImportedFacts {
  const merged: ImportedFacts = { ...EMPTY_FACTS, services: [] };
  for (const page of pages) {
    for (const key of Object.keys(EMPTY_FACTS) as (keyof ImportedFacts)[]) {
      if (key === "services") continue;
      if (!merged[key] && page[key]) (merged as Record<string, unknown>)[key] = page[key];
    }
    merged.services.push(...page.services);
  }
  merged.services = dedupeServices(merged.services);
  return merged;
}

/** Which facts were found, in plain words, for the review screen. */
export function foundLabels(facts: ImportedFacts): string[] {
  const labels: [keyof ImportedFacts, string][] = [
    ["businessName", "business name"],
    ["about", "description"],
    ["phone", "phone"],
    ["email", "email"],
    ["address", "address"],
    ["hours", "hours"],
    ["logoUrl", "logo"],
    ["heroImageUrl", "main photo"],
    ["primaryColor", "brand color"],
  ];
  const found = labels.filter(([key]) => Boolean(facts[key])).map(([, label]) => label);
  if (facts.services.length) found.push(`${facts.services.length} service${facts.services.length === 1 ? "" : "s"}`);
  const socials = [facts.instagram, facts.facebook, facts.google].filter(Boolean).length;
  if (socials) found.push(`${socials} social link${socials === 1 ? "" : "s"}`);
  return found;
}
