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
import { hoursDisplay } from "@/lib/builder/presentation";
import { weeklyHoursFromSummary } from "@/lib/booking-hours";

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

/** A LocalBusiness JSON-LD record built only from verified facts. */
export function localBusinessSchema(input: {
  name: string;
  url: string;
  profile: Profile;
  reviews?: Review[];
  services?: Service[];
  image?: string | null;
}): Record<string, unknown> {
  const p = input.profile ?? {};
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${input.url}#business`,
    name: input.name,
    url: input.url,
  };
  const description = clean(p.description, 500) ?? clean(p.tagline, 300);
  if (description) schema["description"] = description;
  const phone = clean(p.phone, 40);
  if (phone && /\d{3}/.test(phone)) schema["telephone"] = phone;
  const email = clean(p.email, 160);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) schema["email"] = email;
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
  }
  const area = clean(p.service_area, 200);
  if (area) schema["areaServed"] = area;
  const hours = openingHoursSpec(p.hours);
  if (hours.length) schema["openingHoursSpecification"] = hours;
  else {
    const display = hoursDisplay(p.hours);
    if (display) schema["openingHours"] = display;
  }
  const review = clean(p.review_link, 2000);
  if (review?.startsWith("https://")) schema["sameAs"] = [review];

  // Only real, published reviews; aggregate only with at least one rating.
  const rated = (input.reviews ?? []).filter(
    (r) => typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5,
  );
  if (rated.length) {
    const avg = rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length;
    schema["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: Math.round(avg * 10) / 10,
      reviewCount: rated.length,
      bestRating: 5,
      worstRating: 1,
    };
    schema["review"] = rated.slice(0, 5).map((r) => ({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      author: { "@type": "Person", name: clean(r.author_name, 80) ?? "Customer" },
      ...(clean(r.comment, 600) ? { reviewBody: clean(r.comment, 600) } : {}),
      ...(r.created_at ? { datePublished: String(r.created_at).slice(0, 10) } : {}),
    }));
  }

  const offers = (input.services ?? [])
    .map((service) => {
      const name = clean(service.name, 120);
      if (!name) return null;
      const price = Number(service.price ?? service.starting_price ?? NaN);
      return {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name,
          ...(clean(service.description, 300) ? { description: clean(service.description, 300) } : {}),
        },
        ...(Number.isFinite(price) && price > 0 ? { price: price.toFixed(2), priceCurrency: "USD" } : {}),
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
  org: { name: string };
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
  const chrome = readSiteChrome(site.settings?.generation ?? null);
  const trees = [
    ...(site.content?.sections ?? []).map((section) => (section.settings as { composition?: unknown } | null)?.composition),
    chrome.header,
    chrome.footer,
  ];
  const fontsHref = siteFontsHref(site.profile?.font_preference, compositionFonts(trees));
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
            { rel: "stylesheet", href: fontsHref },
          ]
        : []),
    ],
  };
}
