/**
 * Premium mobile template (PR2): a dark, photo-led layout for local-service
 * businesses, built ONLY from stored facts and the owner's own pictures.
 *
 * Everything here is pure and browser-safe so the public renderer, the tests
 * and the local visual harness share one source of truth:
 *  - the opt-in flag (website_settings.generation.template),
 *  - the Premium Dark theme (WCAG AA enforced through site-contrast.ts),
 *  - the facts model (what the page may say), and
 *  - small helpers (two-tone headline split, Maps directions link, trust items,
 *    quick actions).
 *
 * Rule of the module: a slot whose fact is missing is left out. Nothing here
 * writes a claim, price, review, year, licence or service area that was not
 * supplied by the owner.
 */
import { enforceThemeAa } from "@/lib/site-contrast";
import { contrastRatio, readableOn } from "@/lib/readable-color";
import { isPlaceholderPhone } from "@/lib/builder/presentation";

export const PREMIUM_MOBILE_TEMPLATE = "premium-mobile" as const;

/** True when the owner opted this site into the premium mobile template. */
export function readPremiumTemplate(generation: unknown): boolean {
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) return false;
  return (generation as Record<string, unknown>)["template"] === PREMIUM_MOBILE_TEMPLATE;
}

export function writePremiumTemplate(generation: unknown, enabled: boolean): Record<string, unknown> {
  const base = generation && typeof generation === "object" && !Array.isArray(generation) ? { ...(generation as Record<string, unknown>) } : {};
  if (enabled) base["template"] = PREMIUM_MOBILE_TEMPLATE;
  else if (base["template"] === PREMIUM_MOBILE_TEMPLATE) delete base["template"];
  return base;
}

/* ------------------------------------------------------------------ theme */

/** Layered dark surfaces: page < band < card < raised. Neutral, slightly cool. */
export const PREMIUM_DARK_SURFACES = {
  background: "#07090d",
  band: "#0b0f15",
  card: "#11161e",
  raised: "#171e28",
  border: "#232c38",
  borderStrong: "#33404f",
  foreground: "#f4f6f9",
  muted: "#a3adbb",
} as const;

/** Design accent used only when the owner has no brand colour of their own. */
export const PREMIUM_DEFAULT_ACCENT = "#3b82f6";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The accent the template paints buttons with: the owner's brand colour when
 * it reads as an accent on the dark page (>= 3:1, the WCAG non-text minimum),
 * lifted toward light when it is too dark, else the default blue.
 */
export function premiumAccent(brand: string | null | undefined): string {
  const colour = typeof brand === "string" && HEX.test(brand.trim()) ? brand.trim().toLowerCase() : null;
  if (!colour || colour === "#000000" || colour === "#ffffff") return PREMIUM_DEFAULT_ACCENT;
  const ratio = contrastRatio(colour, PREMIUM_DARK_SURFACES.background) ?? 0;
  return ratio >= 3 ? colour : readableOn(colour, PREMIUM_DARK_SURFACES.background, { large: true });
}

/** CSS variables for the Premium Dark theme, with every text pair at WCAG AA. */
export function premiumDarkThemeVars(input: { brandColor?: string | null }): Record<string, string> {
  const s = PREMIUM_DARK_SURFACES;
  const accent = premiumAccent(input.brandColor);
  const onAccent = (contrastRatio("#06080c", accent) ?? 0) >= (contrastRatio("#ffffff", accent) ?? 0) ? "#06080c" : "#ffffff";
  const vars: Record<string, string> = {
    "--background": s.background,
    "--foreground": s.foreground,
    "--card": s.card,
    "--card-foreground": s.foreground,
    "--elevated": s.raised,
    "--popover": s.raised,
    "--popover-foreground": s.foreground,
    "--secondary": s.raised,
    "--secondary-foreground": s.foreground,
    "--muted": s.band,
    "--muted-foreground": s.muted,
    "--border": s.border,
    "--input": s.borderStrong,
    "--primary": accent,
    "--primary-foreground": onAccent,
    "--primary-ink": readableOn(accent, s.background),
    "--accent": accent,
    "--accent-foreground": onAccent,
    "--ring": accent,
    "--pm-band": s.band,
    "--pm-raised": s.raised,
    "--pm-border-strong": s.borderStrong,
    color: s.foreground,
    backgroundColor: s.background,
    colorScheme: "dark",
  };
  return enforceThemeAa(vars) as Record<string, string>;
}

/* ------------------------------------------------------------------ facts */

export type PremiumImage = { src: string; alt: string; focal?: string | null; width?: number | null; height?: number | null };

/** Owner-authored service page detail. Every field is optional and only shown when supplied. */
export type PremiumServiceDetail = {
  problem?: string;
  approach?: string;
  steps?: string[];
  included?: string[];
};

export type PremiumService = {
  name: string;
  description: string | null;
  image: PremiumImage | null;
  href: string | null;
  detail: PremiumServiceDetail;
};

export type PremiumFacts = {
  name: string;
  tagline: string | null;
  description: string | null;
  industry: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  email: string | null;
  address: string | null;
  serviceArea: string | null;
  yearsInBusiness: number | null;
  certifications: string | null;
  logo: string | null;
  hero: PremiumImage | null;
  quoteHref: string | null;
  bookHref: string | null;
  services: PremiumService[];
  nav: { label: string; href: string }[];
};

const clean = (value: unknown, max = 600): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

/** One-line street address from the profile parts that exist; null when there is no street or city. */
export function fullAddress(parts: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }): string | null {
  const street = clean(parts.address, 200);
  const city = clean(parts.city, 80);
  const region = [clean(parts.state, 40), clean(parts.zip, 20)].filter(Boolean).join(" ");
  if (!street && !city) return null;
  return [street, city, region || null].filter(Boolean).join(", ");
}

/** Keyless Google Maps directions link (https, so it passes isSafeHref). */
export function directionsHref(address: string | null | undefined): string | null {
  const text = clean(address, 300);
  return text ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}` : null;
}

/** A real, dialable phone or null (placeholder 555 numbers are never offered). */
export function telHref(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7 || isPlaceholderPhone(digits)) return null;
  return `tel:${digits}`;
}

export function displayPhone(phone: string | null | undefined): string | null {
  if (!telHref(phone)) return null;
  const digits = String(phone).replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}` : clean(phone, 40);
}

/**
 * Splits a supplied headline into two tones. Prefers a sentence break
 * ("Built right. Built to last."), then a comma/dash, then halves the words.
 * Never adds or changes words; a single word stays one tone.
 */
export function splitTwoTone(headline: string): { lead: string; accent: string | null } {
  const text = headline.replace(/\s+/g, " ").trim();
  const sentence = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (sentence) return { lead: sentence[1]!, accent: sentence[2]! };
  const clause = text.match(/^(.+?[,:;—–-])\s+(.+)$/);
  if (clause) return { lead: clause[1]!, accent: clause[2]! };
  const words = text.split(" ");
  if (words.length < 2) return { lead: text, accent: null };
  const cut = Math.ceil(words.length / 2);
  return { lead: words.slice(0, cut).join(" "), accent: words.slice(cut).join(" ") };
}

/** First sentence(s) up to `max` characters, cut at a word, for card copy. */
export function clip(text: string | null | undefined, max = 140): string | null {
  const value = clean(text, 4000);
  if (!value) return null;
  if (value.length <= max) return value;
  const sentence = value.slice(0, max).match(/^(.*[.!?])\s/);
  if (sentence && sentence[1]!.length > max * 0.5) return sentence[1]!;
  return `${value.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export type TrustItem = { kind: "years" | "area" | "credential" | "phone" | "hours"; label: string; value: string };

/**
 * Trust strip from stored facts only. Years appear only from a stored number,
 * the service area only from the stored area, credentials only from the
 * owner's stored certifications text. No fact, no item.
 */
export function trustItems(facts: Pick<PremiumFacts, "yearsInBusiness" | "serviceArea" | "certifications" | "phoneDisplay">): TrustItem[] {
  const items: TrustItem[] = [];
  const years = facts.yearsInBusiness;
  if (typeof years === "number" && Number.isFinite(years) && years >= 1 && years < 200)
    items.push({ kind: "years", value: `${Math.floor(years)}`, label: Math.floor(years) === 1 ? "year in business" : "years in business" });
  const area = clean(facts.serviceArea, 80);
  if (area) items.push({ kind: "area", value: area, label: "Service area" });
  const creds = clean(facts.certifications, 80);
  if (creds) items.push({ kind: "credential", value: creds, label: "Credentials" });
  if (facts.phoneDisplay) items.push({ kind: "phone", value: facts.phoneDisplay, label: "Talk to us" });
  return items;
}

export type QuickAction = { label: string; href: string; ariaLabel: string };

/** Sticky bar slots: Call | Get quote (highlighted) | Directions — each only with its fact. */
export function premiumQuickActions(facts: Pick<PremiumFacts, "phone" | "quoteHref" | "address" | "name">): { primary: QuickAction | null; secondary: QuickAction | null; tertiary: QuickAction | null } {
  const tel = telHref(facts.phone);
  const maps = directionsHref(facts.address);
  return {
    secondary: tel ? { label: "Call", href: tel, ariaLabel: `Call ${facts.name}` } : null,
    primary: facts.quoteHref ? { label: "Get quote", href: facts.quoteHref, ariaLabel: `Get quote from ${facts.name}` } : null,
    tertiary: maps ? { label: "Directions", href: maps, ariaLabel: `Directions to ${facts.name}` } : null,
  };
}

/** Reads owner-authored service detail from generation.premiumTemplate.services. */
export function readServiceDetails(generation: unknown): Record<string, PremiumServiceDetail> {
  const root = generation && typeof generation === "object" ? (generation as Record<string, unknown>)["premiumTemplate"] : null;
  const services = root && typeof root === "object" ? (root as Record<string, unknown>)["services"] : null;
  if (!services || typeof services !== "object" || Array.isArray(services)) return {};
  const out: Record<string, PremiumServiceDetail> = {};
  for (const [name, value] of Object.entries(services as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clean(x, 200)).filter((x): x is string => Boolean(x)).slice(0, 8) : []);
    const detail: PremiumServiceDetail = {};
    const problem = clean(row["problem"], 600);
    const approach = clean(row["approach"], 600);
    if (problem) detail.problem = problem;
    if (approach) detail.approach = approach;
    const steps = list(row["steps"]);
    const included = list(row["included"]);
    if (steps.length) detail.steps = steps;
    if (included.length) detail.included = included;
    out[name.trim().toLowerCase()] = detail;
  }
  return out;
}

type SiteLike = {
  org: { name: string; slug: string; industry?: string | null };
  profile: Record<string, unknown> | null;
  services?: Array<{ name?: string | null; description?: string | null; image_url?: string | null }> | null;
  gallery?: Array<{ url?: string | null; alt_text?: string | null; category?: string | null }> | null;
  settings?: { generation?: unknown } | null;
  quote?: unknown;
  nav?: Array<{ slug: string; title: string; kind: string }> | null;
};

/**
 * The facts model for a site. `href` turns a site path into a real link for
 * the current address (custom domain, /s/slug, preview) — the caller owns it.
 */
export function premiumFactsFrom(site: SiteLike, href: (path: string) => string = (p) => p): PremiumFacts {
  const p = site.profile ?? {};
  const text = (key: string, max?: number) => clean(p[key], max);
  const nav = Array.isArray(site.nav) ? site.nav : [];
  const known = new Set(nav.map((row) => row.slug));
  const contactSlug = ["quote", "contact", "contact-us", "book", "booking"].find((slug) => known.has(slug)) ?? null;
  const bookSlug = ["book", "booking"].find((slug) => known.has(slug)) ?? null;
  const quoteHref = contactSlug ? href(`/${contactSlug}`) : site.quote ? "#quote" : "#contact";
  const servicePages = new Map(nav.filter((row) => row.kind === "service").map((row) => [row.title.trim().toLowerCase(), row.slug]));
  const details = readServiceDetails(site.settings?.generation ?? null);
  const gallery = (site.gallery ?? []).filter((g) => clean(g.url));
  const heroRow = gallery.find((g) => /hero|cover/i.test(g.category ?? ""));
  const heroSrc = text("hero_image_url", 2000) ?? clean(heroRow?.url, 2000);
  const name = clean(site.org.name, 120) ?? "";
  const phone = text("phone", 40);
  const services: PremiumService[] = (site.services ?? [])
    .map((row) => {
      const serviceName = clean(row.name, 120);
      if (!serviceName) return null;
      const key = serviceName.toLowerCase();
      const slug = servicePages.get(key);
      const img = clean(row.image_url, 2000);
      return {
        name: serviceName,
        description: clean(row.description, 1200),
        image: img ? { src: img, alt: serviceName } : null,
        href: slug ? href(`/${slug}`) : null,
        detail: details[key] ?? {},
      } satisfies PremiumService;
    })
    .filter((s): s is PremiumService => s !== null);
  const years = p["years_in_business"];
  return {
    name,
    tagline: text("tagline", 160),
    description: text("description", 1200),
    industry: clean(site.org.industry, 60),
    phone: telHref(phone) ? phone : null,
    phoneDisplay: displayPhone(phone),
    email: text("email", 200),
    address: fullAddress({ address: text("address"), city: text("city"), state: text("state"), zip: text("zip") }),
    serviceArea: text("service_area", 120),
    yearsInBusiness: typeof years === "number" ? years : null,
    certifications: text("certifications", 120),
    logo: text("logo_url", 2000),
    hero: heroSrc ? { src: heroSrc, alt: clean(heroRow?.alt_text, 200) ?? `${name}` } : null,
    quoteHref,
    bookHref: bookSlug ? href(`/${bookSlug}`) : null,
    services,
    nav: nav
      .filter((row) => row.kind !== "thanks" && row.kind !== "service")
      .map((row) => ({ label: row.title, href: href(row.kind === "home" ? "/" : `/${row.slug}`) })),
  };
}

export type PremiumPage =
  | { kind: "home" }
  | { kind: "service"; service: PremiumService }
  | { kind: "other"; title: string };

/** Which template layout a stored page gets: home, a known service's page, or a plain page shell. */
export function premiumPageFor(page: { kind?: string | null; title?: string | null; slug?: string | null } | null, services: PremiumService[]): PremiumPage {
  if (!page || page.kind === "home") return { kind: "home" };
  const title = clean(page.title, 160) ?? "";
  if (page.kind === "service") {
    const key = title.toLowerCase();
    const slug = (page.slug ?? "").toLowerCase();
    const service = services.find((s) => s.name.toLowerCase() === key || (slug && s.href?.toLowerCase().endsWith(`/${slug}`)));
    if (service) return { kind: "service", service };
  }
  return { kind: "other", title: title || "Page" };
}
