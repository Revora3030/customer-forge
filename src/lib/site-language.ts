/**
 * REVORA SITE LANGUAGE — which language a client's website is written in, and
 * which country the business trades in.
 *
 * Both are owner-supplied facts. When the owner leaves them blank the build
 * falls back to the language the owner typed their own details in, which the
 * AI writers are already told to mirror.
 */

export type SiteLanguageOption = { code: string; label: string; htmlLang: string };

/** Common website languages. Owners can still type any other language name. */
export const SITE_LANGUAGES: readonly SiteLanguageOption[] = [
  { code: "en", label: "English", htmlLang: "en" },
  { code: "es", label: "Spanish (Español)", htmlLang: "es" },
  { code: "fr", label: "French (Français)", htmlLang: "fr" },
  { code: "de", label: "German (Deutsch)", htmlLang: "de" },
  { code: "pt", label: "Portuguese (Português)", htmlLang: "pt" },
  { code: "it", label: "Italian (Italiano)", htmlLang: "it" },
  { code: "nl", label: "Dutch (Nederlands)", htmlLang: "nl" },
  { code: "pl", label: "Polish (Polski)", htmlLang: "pl" },
  { code: "tr", label: "Turkish (Türkçe)", htmlLang: "tr" },
  { code: "ar", label: "Arabic (العربية)", htmlLang: "ar" },
  { code: "hi", label: "Hindi (हिन्दी)", htmlLang: "hi" },
  { code: "ja", label: "Japanese (日本語)", htmlLang: "ja" },
  { code: "ko", label: "Korean (한국어)", htmlLang: "ko" },
  { code: "zh", label: "Chinese (中文)", htmlLang: "zh" },
  { code: "sw", label: "Swahili (Kiswahili)", htmlLang: "sw" },
  { code: "tl", label: "Filipino (Tagalog)", htmlLang: "tl" },
] as const;

export type CountryOption = { code: string; label: string };

/** Countries offered in onboarding. ISO 3166-1 alpha-2 codes. */
export const COUNTRIES: readonly CountryOption[] = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "ZA", label: "South Africa" },
  { code: "NG", label: "Nigeria" },
  { code: "KE", label: "Kenya" },
  { code: "GH", label: "Ghana" },
  { code: "IN", label: "India" },
  { code: "PK", label: "Pakistan" },
  { code: "PH", label: "Philippines" },
  { code: "SG", label: "Singapore" },
  { code: "MY", label: "Malaysia" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "BE", label: "Belgium" },
  { code: "PT", label: "Portugal" },
  { code: "PL", label: "Poland" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "CH", label: "Switzerland" },
  { code: "AT", label: "Austria" },
  { code: "TR", label: "Turkey" },
  { code: "MX", label: "Mexico" },
  { code: "BR", label: "Brazil" },
  { code: "AR", label: "Argentina" },
  { code: "CO", label: "Colombia" },
  { code: "CL", label: "Chile" },
  { code: "PE", label: "Peru" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "JM", label: "Jamaica" },
  { code: "TT", label: "Trinidad and Tobago" },
] as const;

/** Normalises a stored or typed country to an ISO code, or null. */
export function normalizeCountry(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const match = COUNTRIES.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  return match?.code ?? null;
}

export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.label ?? code.toUpperCase();
}

/** Normalises a stored or typed language to a short display name, or null. */
export function normalizeSiteLanguage(value: unknown): string | null {
  const raw = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const byCode = SITE_LANGUAGES.find((l) => l.code === lower);
  if (byCode) return byCode.code;
  const byLabel = SITE_LANGUAGES.find(
    (l) => l.label.toLowerCase() === lower || l.label.toLowerCase().startsWith(`${lower} `),
  );
  if (byLabel) return byLabel.code;
  // Free-typed language names are kept (letters, spaces, hyphens, brackets only).
  return /^[\p{L}\s()-]{2,40}$/u.test(raw) ? raw : null;
}

/** Human-readable language name for AI instructions. */
export function siteLanguageName(value: string | null | undefined): string | null {
  const normal = normalizeSiteLanguage(value);
  if (!normal) return null;
  return SITE_LANGUAGES.find((l) => l.code === normal)?.label ?? normal;
}

/** BCP-47-ish value for the `<html lang>` attribute, or null when unknown. */
export function siteHtmlLang(value: string | null | undefined): string | null {
  const normal = normalizeSiteLanguage(value);
  if (!normal) return null;
  return SITE_LANGUAGES.find((l) => l.code === normal)?.htmlLang ?? null;
}

/** One-line writing instruction for every AI pass that writes visitor copy. */
export function languageInstruction(language: string | null | undefined): string {
  const name = siteLanguageName(language);
  return name
    ? `Write ALL visitor-facing wording (headlines, buttons, FAQs, meta tags) in ${name}. Keep the business name and service names exactly as given.`
    : "Write visitor-facing wording in the same language the owner used for the business details.";
}
