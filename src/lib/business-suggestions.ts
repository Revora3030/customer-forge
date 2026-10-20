/**
 * BUSINESS SUGGESTIONS — the command bar's placeholder and chips, built from
 * this tenant's own records.
 *
 * Pure and deterministic: the same workspace data always gives the same
 * suggestions. It never names a service the business does not list, never
 * borrows another trade's wording, and never shows a number it was not given.
 * Unknown counts are `null` and simply produce no count-based chip.
 *
 * This is app UI derived from real data, not customer-website creative.
 */

export type SiteState = "none" | "draft" | "published";

export type BusinessSuggestionInput = {
  businessName?: string | null | undefined;
  industry?: string | null | undefined;
  /** Active service names from the tenant's services table, in display order.
   *  `null`/omitted means not loaded yet: no service-based chip is offered. */
  services?: readonly (string | null | undefined)[] | null | undefined;
  siteState: SiteState;
  /** Slugs and titles of the tenant's existing website pages, when known. */
  pages?:
    | readonly { slug?: string | null | undefined; title?: string | null | undefined }[]
    | null
    | undefined;
  /** Leads still waiting for a first reply. `null` when not loaded. */
  newLeads?: number | null | undefined;
  quotes?: number | null | undefined;
  reviews?: number | null | undefined;
  bookings?: number | null | undefined;
};

export type SuggestionChip = {
  /** What the owner sees; also the text routed through the command router. */
  label: string;
  /** Direct in-app destination, for work the router has no target for. */
  route?: string;
  /** Hand the label straight to the website assistant (service names can
   *  contain words like "booking" that would otherwise mis-route). */
  assistant?: boolean;
};

export type BusinessSuggestions = {
  placeholder: string;
  chips: SuggestionChip[];
};

const MAX_CHIPS = 6;
const MAX_SERVICE_PAGE_CHIPS = 2;

/** Industry values that say nothing about the trade. */
const GENERIC_INDUSTRIES = new Set(["", "other", "general", "business", "none", "n/a", "na"]);

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueServices(services: BusinessSuggestionInput["services"]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of services ?? []) {
    const name = clean(raw).slice(0, 60);
    const key = slugify(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function industryPhrase(industry: string | null | undefined): string | null {
  const text = clean(industry).replace(/[_-]+/g, " ").toLowerCase().slice(0, 40);
  return GENERIC_INDUSTRIES.has(text) ? null : text;
}

function knownCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** True when an existing page already covers this service. */
function hasPageFor(
  service: string,
  pages: NonNullable<BusinessSuggestionInput["pages"]>,
): boolean {
  const key = slugify(service);
  if (!key) return true;
  return pages.some((page) => {
    const slug = slugify(clean(page.slug));
    const title = slugify(clean(page.title));
    return slug.includes(key) || title.includes(key);
  });
}

/** Lower-cases ordinary words but keeps acronyms such as "PPF" intact. */
function inSentence(name: string): string {
  return name
    .split(" ")
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

function buildPlaceholder(
  services: string[],
  industry: string | null,
  businessName: string,
): string {
  const first = services[0];
  if (first) return `e.g. I want more ${inSentence(first)} bookings this month`;
  if (industry) return `e.g. I want more ${industry} customers this month`;
  if (businessName) return `e.g. I want more customers for ${businessName} this month`;
  return "e.g. I want more customers from my website this month";
}

export function buildBusinessSuggestions(input: BusinessSuggestionInput): BusinessSuggestions {
  const servicesKnown = Array.isArray(input.services);
  const services = uniqueServices(input.services);
  const industry = industryPhrase(input.industry);
  const newLeads = knownCount(input.newLeads);
  const reviews = knownCount(input.reviews);
  const quotes = knownCount(input.quotes);
  const bookings = knownCount(input.bookings);

  const chips: SuggestionChip[] = [];
  const push = (chip: SuggestionChip) => {
    if (chips.length >= MAX_CHIPS) return;
    if (chips.some((existing) => existing.label === chip.label)) return;
    chips.push(chip);
  };

  // 1. The website itself is the next step until it is live.
  if (input.siteState === "none") push({ label: "Build my website" });
  if (input.siteState === "draft") push({ label: "Launch my site" });

  // 2. Real people already waiting on a reply.
  if (newLeads !== null && newLeads > 0) {
    push({
      label: `Follow up my ${newLeads} new ${newLeads === 1 ? "lead" : "leads"}`,
      route: "/app/leads",
    });
  }

  // 3. Services: add them if there are none, otherwise give each one a page.
  if (servicesKnown && services.length === 0) {
    push({ label: "Add my services", route: "/app/services" });
  } else if (input.siteState !== "none" && input.pages) {
    const pages = input.pages;
    services
      .filter((service) => !hasPageFor(service, pages))
      .slice(0, MAX_SERVICE_PAGE_CHIPS)
      .forEach((service) => push({ label: `Add a page for ${service}`, assistant: true }));
  }

  // 4. Trust and conversion gaps, only when the count is actually known.
  if (reviews === 0) push({ label: "Get more reviews", route: "/app/reviews" });
  if (bookings === 0 && services.length > 0) push({ label: "Add booking" });
  if (quotes === 0 && services.length > 0) push({ label: "Add a quote calculator" });

  // 5. Always-relevant improvements with no trade or service wording.
  push({ label: "Improve my SEO" });
  push({ label: "Make my homepage convert better" });
  if (input.siteState === "published") push({ label: "Connect my domain" });
  push({ label: "Show me what's wrong" });

  const businessName = clean(input.businessName).slice(0, 60);
  return { placeholder: buildPlaceholder(services, industry, businessName), chips };
}
