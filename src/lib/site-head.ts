/**
 * Search and browser metadata every published client website carries.
 *
 * Top site builders ship this automatically: a LocalBusiness record so search
 * engines show the business's name, phone, address, hours and reviews; the
 * business's own logo as the browser-tab icon; and a theme colour for mobile
 * browser chrome. Before this, client sites had none of it (and inherited
 * Revora's own icon and Organization record instead).
 *
 * Every value comes from the owner's verified profile. Nothing is invented;
 * an unknown field is simply left out.
 */
import { isPlaceholderEmail, isPlaceholderPhone, placeDisplay } from "@/lib/builder/presentation";
import { weeklyHoursFromSummary } from "@/lib/booking-hours";
import { readSiteChrome } from "@/lib/builder/site-chrome";
import { readCopy } from "@/lib/site-engine";
import { readSeo } from "@/lib/site-seo";
import { compositionFonts, siteFontsHref } from "@/lib/site-theme";
import { siteFontFor } from "@/lib/site-font-pairings";
import { faqPageSchema, metaDescription, metaTitle } from "@/lib/seo";
import { compositionFaqItems } from "@/lib/builder/composition-faq";
import { pageNavLabel } from "@/lib/website-content";
import { playbookFor } from "@/lib/builder/industry-playbook";

type Profile = {
  tagline?: string | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  service_area?: string | null;
  hours?: unknown;
  logo_url?: string | null;
  hero_image_url?: string | null;
  primary_color?: string | null;
  review_link?: string | null;
} | null | undefined;

type Review = { rating?: number | null; author_name?: string | null; comment?: string | null; created_at?: string | null };
type Service = { name?: string | null; description?: string | null; price?: number | string | null; starting_price?: number | string | null };

const DAY_SCHEMA: Record<string, string> = {
  mon: "Monday", monday: "Monday",
  tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
  wed: "Wednesday", weds: "Wednesday", wednesday: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday",
  fri: "Friday", friday: "Friday",
  sat: "Saturday", saturday: "Saturday",
  sun: "Sunday", sunday: "Sunday",
};

function clean(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function to24h(raw: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i.exec(raw.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const mer = m[3]?.toLowerCase();
  if (minute > 59 || hour > 24) return null;
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    if (mer.startsWith("p") && hour !== 12) hour += 12;
    if (mer.startsWith("a") && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** schema.org OpeningHoursSpecification from the owner's free-text hours. */
export function openingHoursSpec(hours: unknown): Record<string, unknown>[] {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return [];
  const out: Record<string, unknown>[] = [];
  const record = hours as Record<string, unknown>;
  // Onboarding stores free text as { summary }; read it as days too.
  const entries: [string, unknown][] = [
    ...Object.entries(typeof record["summary"] === "string" ? weeklyHoursFromSummary(record["summary"]) : {}),
    ...Object.entries(record),
  ];
  const seenDays = new Set<string>();
  for (const [key, raw] of entries) {
    const day = DAY_SCHEMA[key.trim().toLowerCase()];
    if (day && seenDays.has(day)) continue;
    if (day) seenDays.add(day);
    if (!day) continue;
    const text =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object"
          ? String((raw as Record<string, unknown>)["hours"] ?? (raw as Record<string, unknown>)["value"] ?? "")
          : "";
    const parts = text.toLowerCase().split(/\s*(?:-|–|—|to)\s*/);
    if (parts.length !== 2) continue;
    let opens = to24h(parts[0]!);
    let closes = to24h(parts[1]!);
    if (!opens || !closes) continue;
    // "9-5" with no am/pm: the closing hour is in the afternoon.
    if (closes <= opens && !/[ap]/.test(parts[1]!)) {
      const [h, mm] = closes.split(":");
      closes = `${String(Number(h) + 12).padStart(2, "0")}:${mm}`;
    }
    if (closes <= opens) continue;
    if (opens === "24:00") opens = "00:00";
    out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens, closes });
  }
  return out;
}

export type SchemaType = { type: string; serviceType?: string };

const CUISINES = ["Italian", "Mexican", "Chinese", "Japanese", "Thai", "Indian", "French", "Greek", "Korean", "Vietnamese", "Mediterranean", "Spanish", "Caribbean", "Ethiopian", "Lebanese", "Turkish", "Peruvian", "Brazilian", "American", "Southern", "Cajun", "Sushi", "Pizza", "Barbecue", "BBQ", "Seafood", "Vegan", "Vegetarian", "Tex-Mex", "Middle Eastern"];

/**
 * The most specific schema.org type for the business's own industry text. A trade schema.org has no type for
 * (cleaning, pressure washing, landscaping) is a HomeAndConstructionBusiness with a serviceType, never a
 * neighbouring trade's type. Unknown industries stay LocalBusiness.
 */
export function resolveSchemaType(industry: string | null | undefined): SchemaType {
  const text = (industry ?? "").trim();
  if (!text) return { type: "LocalBusiness" };
  const key = playbookFor(text)?.key;
  const service = (serviceType: string, type = "HomeAndConstructionBusiness"): SchemaType => ({ type, serviceType });
  switch (key) {
    case "plumbing": return { type: "Plumber" };
    case "hvac": return { type: "HVACBusiness" };
    case "roofing": return { type: "RoofingContractor" };
    case "electrical": return { type: "Electrician" };
    case "locksmith": return { type: "Locksmith" };
    case "painting": return { type: "HousePainter" };
    case "contracting": return { type: "GeneralContractor" };
    case "moving": return { type: "MovingCompany" };
    case "auto-repair": return /body shop|collision|dent repair|auto body/i.test(text) ? { type: "AutoBodyShop" } : { type: "AutoRepair" };
    case "auto-detailing": return service("Auto detailing", "AutoRepair");
    case "towing": return service("Towing and roadside assistance", "AutomotiveBusiness");
    case "cleaning": return service(/commercial|janitor|office/i.test(text) ? "Commercial cleaning" : "House cleaning");
    case "pressure-washing": return service("Pressure washing");
    case "exterior-cleaning": return service(/window/i.test(text) ? "Window cleaning" : /gutter/i.test(text) ? "Gutter cleaning" : "Exterior cleaning");
    case "landscaping": return service(/tree/i.test(text) ? "Tree service" : /lawn|mow/i.test(text) ? "Lawn care" : "Landscaping");
    case "pest": return service("Pest control");
    case "pool": return service("Pool service");
    case "garage-door": return service("Garage door service");
    case "appliance-repair": return service("Appliance repair");
    case "solar": return service("Solar installation");
    case "restaurants":
      if (/bakery|patisserie/i.test(text)) return { type: "Bakery" };
      if (/caf[eé]|coffee/i.test(text)) return { type: "CafeOrCoffeeShop" };
      if (/\bbar\b|pub|brewery/i.test(text)) return { type: /brewery/i.test(text) ? "Brewery" : "BarOrPub" };
      return { type: "Restaurant" };
    case "salons-barbers":
      if (/nail/i.test(text)) return { type: "NailSalon" };
      if (/tattoo/i.test(text)) return { type: "TattooParlor" };
      if (/\bspa\b|massage/i.test(text)) return { type: "DaySpa" };
      if (/hair|barber|salon/i.test(text)) return { type: "HairSalon" };
      return { type: "BeautySalon" };
    case "med-spa": return service("Medical spa", "DaySpa");
    case "dentist": return { type: "Dentist" };
    case "medical-wellness":
      if (/\bvet/i.test(text)) return { type: "VeterinaryCare" };
      if (/optom/i.test(text)) return { type: "Optician" };
      if (/physio|chiropract|therap/i.test(text)) return service(text.slice(0, 80), "MedicalClinic");
      return { type: "MedicalClinic" };
    case "gyms-fitness": return { type: "HealthClub" };
    case "law-firms": return { type: "LegalService" };
    case "real-estate": return { type: "RealEstateAgent" };
    case "professional-services":
      if (/account|\btax|bookkeep|\bcpa\b/i.test(text)) return { type: "AccountingService" };
      if (/insurance/i.test(text)) return { type: "InsuranceAgency" };
      if (/financ|mortgage|wealth|advis/i.test(text)) return { type: "FinancialService" };
      return { type: "ProfessionalService" };
    case "photo-creative": return service(text.slice(0, 80), "ProfessionalService");
    case "education": return /daycare|childcare/i.test(text) ? { type: "ChildCare" } : service(text.slice(0, 80), "LocalBusiness");
    default: return { type: "LocalBusiness" };
  }
}

type Social = { facebook?: string | null; instagram?: string | null; linkedin?: string | null; tiktok?: string | null; youtube?: string | null; google_business?: string | null } | null | undefined;

/** A price range from the owner's own service prices only, e.g. "$80-$450". Null without real prices. */
export function priceRangeFrom(services: readonly Service[] | null | undefined): string | null {
  const prices = (services ?? [])
    .map((s) => Number(s.price ?? s.starting_price ?? NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return null;
  const lo = Math.round(Math.min(...prices));
  const hi = Math.round(Math.max(...prices));
  return lo === hi ? `$${lo}` : `$${lo}-$${hi}`;
}

/** A LocalBusiness JSON-LD record built only from verified facts. */
export function localBusinessSchema(input: {
  name: string;
  url: string;
  profile: Profile;
  reviews?: Review[];
  services?: Service[];
  image?: string | null;
  /** The organisation's own industry text: picks the most specific schema.org type. */
  industry?: string | null;
  /** The owner's own social profile links, for sameAs. */
  social?: Social;
}): Record<string, unknown> {
  const p = input.profile ?? {};
  const resolved = resolveSchemaType(input.industry);
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": resolved.type,
    "@id": `${input.url}#business`,
    name: input.name,
    url: input.url,
  };
  if (resolved.serviceType) schema["knowsAbout"] = resolved.serviceType;
  if (resolved.type === "Restaurant") {
    const cuisine = CUISINES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(input.industry ?? ""));
    if (cuisine) schema["servesCuisine"] = cuisine;
  }
  const description = clean(p.description, 500) ?? clean(p.tagline, 300);
  if (description) schema["description"] = description;
  const phone = clean(p.phone, 40);
  if (phone && /\d{3}/.test(phone) && !isPlaceholderPhone(phone)) schema["telephone"] = phone;
  const email = clean(p.email, 160);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isPlaceholderEmail(email)) schema["email"] = email;
  const logo = clean(p.logo_url, 2000);
  if (logo?.startsWith("https://")) schema["logo"] = logo;
  const image = input.image ?? clean(p.hero_image_url, 2000);
  if (image?.startsWith("https://")) schema["image"] = image;
  const street = clean(p.address, 200);
  const city = clean(p.city, 100);
  const region = clean(p.state, 60);
  const postal = clean(p.zip, 20);
  if (street || city || region || postal) {
    schema["address"] = {
      "@type": "PostalAddress",
      ...(street ? { streetAddress: street } : {}),
      ...(city ? { addressLocality: city } : {}),
      ...(region ? { addressRegion: region } : {}),
      ...(postal ? { postalCode: postal } : {}),
    };
    // A map link only for a real street address the owner gave; never coordinates we do not have.
    if (street && (city || postal)) {
      schema["hasMap"] = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([street, city, region, postal].filter(Boolean).join(", "))}`;
    }
  }
  const area = clean(p.service_area, 200);
  // "Raleigh, NC + 25 miles" names the place; the radius is not a place name.
  const areaPlace = area ? area.replace(/\s*(?:\+|\bplus\b|&)\s*\d{1,3}\s*(?:mi|miles?|km|kilometres|kilometers)\b.*$/i, "").trim() : null;
  if (areaPlace) schema["areaServed"] = areaPlace;
  const hours = openingHoursSpec(p.hours);
  // Only structured hours: a free-text openingHours string is not valid schema.org.
  if (hours.length) schema["openingHoursSpecification"] = hours;
  const sameAs = [
    clean(p.review_link, 2000),
    ...["google_business", "facebook", "instagram", "linkedin", "tiktok", "youtube"].map((k) => clean((input.social as Record<string, unknown> | null | undefined)?.[k], 2000)),
  ].filter((u): u is string => !!u && u.startsWith("https://"));
  if (sameAs.length) schema["sameAs"] = [...new Set(sameAs)];
  const priceRange = priceRangeFrom(input.services);
  if (priceRange) schema["priceRange"] = priceRange;

  // No aggregateRating or review[] here: Google ignores reviews a business marks
  // up about itself in its own LocalBusiness data. The reviews stay visible on
  // the page; they are just not self-served as structured data.

  const offers = (input.services ?? [])
    .map((service) => {
      const name = clean(service.name, 120);
      if (!name) return null;
      const exact = Number(service.price ?? NaN);
      const startingAt = Number(service.starting_price ?? NaN);
      const hasExact = Number.isFinite(exact) && exact > 0;
      const hasStarting = !hasExact && Number.isFinite(startingAt) && startingAt > 0;
      return {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name,
          ...(clean(service.description, 300) ? { description: clean(service.description, 300) } : {}),
        },
        // An exact price only when the owner set one; a "starting at" figure is a
        // minimum, so it goes out as a PriceSpecification with minPrice.
        ...(hasExact ? { price: exact.toFixed(2), priceCurrency: "USD" } : {}),
        ...(hasStarting
          ? { priceSpecification: { "@type": "PriceSpecification", minPrice: startingAt.toFixed(2), priceCurrency: "USD" } }
          : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 20);
  if (offers.length) schema["hasOfferCatalog"] = { "@type": "OfferCatalog", name: "Services", itemListElement: offers };
  return schema;
}

/**
 * JSON that is safe to place inside a <script> tag: "</script>" and HTML
 * comment openers in owner-supplied text can no longer close the tag early.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Browser-tab icon and theme colour for a client site. */
export function siteIconLinks(profile: Profile): { rel: string; href: string; type?: string }[] {
  const logo = clean(profile?.logo_url, 2000);
  if (!logo?.startsWith("https://")) return [];
  return [
    { rel: "icon", href: logo },
    { rel: "apple-touch-icon", href: logo },
  ];
}

export function siteThemeColor(profile: Profile): string | null {
  const color = clean(profile?.primary_color, 20);
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

type HeadSite = {
  org: { id?: string | null; slug?: string | null; name: string; industry?: string | null };
  social?: Social;
  profile?: Profile & { font_preference?: string | null };
  settings?: { generation?: unknown } | null;
  reviews?: Review[];
  services?: Service[];
  content?: { page?: { og_image_url?: string | null } | null; sections?: { settings?: unknown }[] } | null;
};

/**
 * Everything a client page adds to <head> besides title/description/OG:
 * fonts (site + AI-layout fonts), icon, theme colour and LocalBusiness data.
 * Shared by the share-link routes and the custom-domain routes so a business
 * looks and indexes the same on both addresses.
 */
export function clientHeadExtrasSync(
  site: HeadSite,
  businessUrl: string,
  compositionFonts: (trees: unknown[]) => string[],
  siteFontsHref: (preference: string | null | undefined, extra: string[]) => string | null,
  readSiteChrome: (generation: unknown) => { header: unknown; footer: unknown },
) {
  // Only the site's own pairing is requested: layout nodes never use another
  // family (pairingRoleFont), so AI-named faces are not downloaded either.
  const fontsHref = siteFontsHref(siteFontFor(site.profile?.font_preference, site.org), []);
  const theme = siteThemeColor(site.profile);
  const shareImage = site.content?.page?.og_image_url || site.profile?.hero_image_url || null;
  return {
    meta: theme ? [{ name: "theme-color", content: theme }] : [],
    scripts: [
      {
        type: "application/ld+json",
        children: safeJsonLd(
          localBusinessSchema({
            name: site.org.name,
            url: businessUrl,
            profile: site.profile,
            reviews: site.reviews ?? [],
            services: site.services ?? [],
            image: shareImage && shareImage.startsWith("https://") ? shareImage : null,
            industry: site.org.industry ?? null,
            social: site.social ?? null,
          }),
        ),
      },
    ],
    links: [
      ...siteIconLinks(site.profile),
      ...(fontsHref
        ? [
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
            // Preload starts the stylesheet fetch before render-blocking CSS
            // resolves; the request itself carries display=swap, so text shows
            // in the fallback face at once and swaps when the faces arrive.
            { rel: "preload", as: "style", href: fontsHref },
            { rel: "stylesheet", href: fontsHref },
          ]
        : []),
    ],
  };
}

/**
 * The picture a shared link shows: the page's own share image, else the owner's
 * main photo, else the first real https picture on the page. Most sites only
 * have section photos, so without the last fallback shared links showed none.
 */
export function shareImageFor(input: {
  ogImage?: string | null;
  heroImage?: string | null;
  sections?: { components?: unknown[] | null }[] | null;
}): string | null {
  const https = (value: unknown): value is string => typeof value === "string" && value.startsWith("https://");
  if (https(input.ogImage)) return input.ogImage;
  if (https(input.heroImage)) return input.heroImage;
  for (const section of input.sections ?? [])
    for (const component of section.components ?? []) {
      const url = (component as { url?: unknown } | null)?.url;
      if (https(url)) return url;
    }
  return null;
}

/**
 * True when the profile carries reserved sample contact data: a 555-01xx
 * phone (the numbers reserved for fiction) or an email on a reserved
 * example/test domain. Such a business is a placeholder, never a real listing.
 */
export function hasPlaceholderContact(profile: { phone?: string | null; email?: string | null } | null | undefined): boolean {
  return isPlaceholderPhone(profile?.phone ?? "") || isPlaceholderEmail(profile?.email ?? "");
}

/**
 * A workspace slug that marks a test, demo or sample site (a whole hyphen-
 * separated word: "oak-city-test-demo", "sample-bakery", not "contest-hub").
 */
export function hasTestSlug(slug: string | null | undefined): boolean {
  return String(slug ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => token === "demo" || token === "test" || token === "sample" || token === "example" || token === "placeholder");
}

/**
 * True for a site that must never be advertised to search engines: a demo
 * workspace, a test/demo/sample slug, or reserved sample contact data. Shared by
 * the page head (noindex) and the sitemaps so the two always agree.
 */
export function isNonIndexableSite(input: {
  isDemo?: boolean | null | undefined;
  slug?: string | null | undefined;
  profile?: { phone?: string | null; email?: string | null } | null | undefined;
}): boolean {
  return input.isDemo === true || hasTestSlug(input.slug) || hasPlaceholderContact(input.profile);
}

type TenantHeadPage = {
  slug?: string | null;
  title?: string | null;
  kind?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  noindex?: boolean | null;
};

export type TenantHeadSite = {
  org: { id?: string | null; slug?: string | null; name: string; industry?: string | null };
  /** Demo workspace (organizations.is_demo): sample data, never real business facts. */
  isDemo?: boolean | null;
  social?: Social;
  profile?: (Profile & { font_preference?: string | null }) | null;
  settings?: { generation?: unknown; seo?: unknown } | null;
  reviews?: Review[];
  services?: Service[];
  content?: {
    page?: TenantHeadPage | null;
    sections?: { settings?: unknown; components?: unknown[] | null }[] | null;
  } | null;
};

/**
 * The one <head> every client page uses: the /s/ share address, the custom
 * domain home, its inner pages and its /about, /contact and /pricing paths.
 *
 * Wording stays the AI- or owner-authored page SEO. Code only applies safety:
 * word-boundary length limits, business-name de-duplication, noindex, and the
 * share image / LocalBusiness / font extras every address must carry.
 */
export function tenantSiteHead(input: {
  site: TenantHeadSite;
  pageSlug?: string | null;
  /** Absolute canonical URL of this page (also og:url). */
  canonical: string;
  /** Absolute home URL of the business, used for LocalBusiness data. */
  businessUrl: string;
  noindex?: boolean;
}) {
  const { site } = input;
  const name = site.org.name;
  const page = site.content?.page ?? null;
  const isHome = page ? page.kind === "home" : !input.pageSlug || input.pageSlug === "home";
  const city = placeDisplay(site.profile?.city);
  const generated = readCopy((site.settings?.generation as { copy?: unknown } | null)?.copy);
  const label = pageNavLabel(page?.title, name, page?.slug ?? input.pageSlug ?? null);

  const fallbackTitle = isHome
    ? generated?.metaTitle || `${name}${city ? ` — ${city}` : ""}`
    : `${label} — ${name}`;
  const title = metaTitle(page?.seo_title || fallbackTitle, name);
  const rawDescription =
    page?.seo_description ||
    (isHome ? generated?.metaDescription || readSeo(site.settings?.seo).meta_description : null) ||
    site.profile?.tagline ||
    (isHome ? `${name}${city ? ` in ${city}` : ""}.` : `${label} from ${name}.`);
  const description = metaDescription(rawDescription);
  const sections = site.content?.sections;
  const shareImage = shareImageFor({
    ogImage: page?.og_image_url ?? null,
    heroImage: site.profile?.hero_image_url ?? null,
    sections: Array.isArray(sections) ? sections : [],
  });
  // A home page with nothing on it ("still being built") must not be indexed, and
  // must not hand search engines ratings or reviews, whatever rows exist behind it.
  // No content at all (no home page in the published copy, so `content` is
  // null) is the same empty shell: the route renders the placeholder for it.
  const emptyHome = isHome && !(Array.isArray(sections) && sections.length > 0);
  const extras = clientHeadExtrasSync(
    (emptyHome ? { ...site, reviews: [] } : site) as HeadSite,
    input.businessUrl,
    compositionFonts,
    siteFontsHref,
    readSiteChrome,
  );
  // Demo workspaces and placeholder businesses (sample phone/email) carry made-up
  // facts: they are never indexed and never emit structured data of any kind.
  const placeholder = isNonIndexableSite({ isDemo: site.isDemo, slug: site.org.slug, profile: site.profile });
  const noindex = input.noindex === true || page?.noindex === true || emptyHome || placeholder;
  const emitSchema = !placeholder && !emptyHome;
  const faqs = emitSchema ? compositionFaqItems(sections ?? []) : [];

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: page?.og_title || title },
      { property: "og:description", content: page?.og_description || description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: input.canonical },
      { property: "og:site_name", content: name },
      { name: "twitter:card", content: "summary_large_image" },
      ...(shareImage
        ? [
            { property: "og:image", content: shareImage },
            { name: "twitter:image", content: shareImage },
          ]
        : []),
      ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
      ...extras.meta,
    ],
    scripts: [...(emitSchema ? extras.scripts : []), ...(faqs.length ? [{ type: "application/ld+json", children: safeJsonLd(faqPageSchema(faqs)) }] : [])],
    links: [{ rel: "canonical", href: input.canonical }, ...extras.links],
  };
}
