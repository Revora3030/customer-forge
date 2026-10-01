import type { BrandPreference } from "@/lib/builder/composition-preview";

export const EMPTY_BRAND_CHOICES: BrandPreference = {
  tone: "any",
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  font: null,
  directionId: null,
};

const keyFor = (organizationId: string | null) => `revora:brand:${organizationId ?? "none"}`;

export function readBrandChoices(organizationId: string | null): BrandPreference {
  if (typeof window === "undefined") return EMPTY_BRAND_CHOICES;
  try {
    const raw = window.localStorage.getItem(keyFor(organizationId));
    if (!raw) return EMPTY_BRAND_CHOICES;
    return { ...EMPTY_BRAND_CHOICES, ...(JSON.parse(raw) as BrandPreference) };
  } catch {
    return EMPTY_BRAND_CHOICES;
  }
}

export function hasBrandChoices(brand: BrandPreference): boolean {
  return Boolean(
    (brand.tone && brand.tone !== "any") ||
      brand.primaryColor ||
      brand.secondaryColor ||
      brand.accentColor ||
      brand.font,
  );
}

export function saveBrandChoices(organizationId: string | null, brand: BrandPreference) {
  try {
    window.localStorage.setItem(keyFor(organizationId), JSON.stringify(brand));
  } catch {
    // A browser with storage switched off still applies the choice in this request.
  }
}
