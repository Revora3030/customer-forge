/**
 * REVORA BUSINESS FACTS — one typed model every generated section consumes.
 *
 * Raw workspace rows are never handed to a component. They are normalised here
 * into a `BusinessFacts` record where each field is either a clean, validated,
 * display-ready value or `null`. A `null` field is a MISSING FACT: sections omit
 * it or ask the owner for it. Nothing in this module invents a value.
 */
import {
  addressDisplay,
  emailDisplay,
  hoursDisplay,
  phoneDisplay,
  phoneLink,
  emailLink,
  placeDisplay,
  safeParagraph,
  safeText,
  externalUrl,
  yearsDisplay,
} from "./presentation";

/** The shape of a stored business profile, as loosely as it may arrive. */
export type RawProfile = Record<string, unknown> | null | undefined;

export type BusinessFacts = {
  businessName: string | null;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  phoneHref: string | null;
  email: string | null;
  emailHref: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  serviceArea: string | null;
  hours: string | null;
  yearsInBusiness: string | null;
  certifications: string | null;
  awards: string | null;
  ownerName: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  /** Field names with no usable value — used to omit sections and to ask. */
  unknownFields: string[];
};

const FIELD_ORDER = [
  "businessName",
  "tagline",
  "description",
  "phone",
  "email",
  "website",
  "address",
  "city",
  "state",
  "zip",
  "serviceArea",
  "hours",
  "yearsInBusiness",
  "certifications",
  "awards",
  "ownerName",
  "logoUrl",
  "heroImageUrl",
] as const;

/** Normalises a stored profile (plus the workspace name) into typed facts. */
export function businessFacts(profile: RawProfile, businessName?: unknown): BusinessFacts {
  const row = (profile ?? {}) as Record<string, unknown>;
  const facts: Omit<BusinessFacts, "unknownFields"> = {
    businessName: safeText(businessName ?? row["business_name"]),
    tagline: safeText(row["tagline"]),
    description: safeParagraph(row["description"]),
    phone: phoneDisplay(row["phone"]),
    phoneHref: phoneLink(row["phone"]),
    email: emailDisplay(row["email"]),
    emailHref: emailLink(row["email"]),
    website: externalUrl(row["website"]),
    address: safeText(row["address"]),
    city: placeDisplay(row["city"]),
    state: placeDisplay(row["state"]),
    zip: safeText(row["zip"]),
    serviceArea: placeDisplay(row["service_area"]),
    hours: hoursDisplay(row["hours"]),
    yearsInBusiness: yearsDisplay(row["years_in_business"]),
    certifications: safeText(row["certifications"]),
    awards: safeText(row["awards"]),
    ownerName: safeText(row["owner_name"]),
    logoUrl: externalUrl(row["logo_url"]),
    heroImageUrl: externalUrl(row["hero_image_url"]),
  };

  const unknownFields = FIELD_ORDER.filter(
    (field) => !facts[field as keyof typeof facts],
  ) as string[];

  return { ...facts, unknownFields };
}

/** Full postal address line built from the validated parts. */
export const factsAddressLine = (facts: BusinessFacts): string | null => {
  // Owners often type the full address (with city/state/zip) into the street
  // field. Appending the city again produced "123 Test St, Chapel Hill, NC
  // 27514, Chapel Hill, NC". Drop the locality when the street already has it.
  const street = typeof facts.address === "string" ? facts.address.toLowerCase() : "";
  const city = typeof facts.city === "string" ? facts.city.trim().toLowerCase() : "";
  const repeats = Boolean(street && city && street.includes(city));
  return addressDisplay({
    address: facts.address,
    city: repeats ? null : facts.city,
    state: repeats ? null : facts.state,
    zip: repeats ? null : facts.zip,
  });
};

/** "Certifications" style copy is only safe when the owner actually entered it. */
export function isSupportedClaim(value: unknown): boolean {
  const text = safeText(value);
  if (!text) return false;
  return !/^(?:none|n\/a|na|no|nope|tbd|unknown)$/i.test(text);
}

/** The facts a section needs before it may claim anything about experience. */
export function claimableFacts(facts: BusinessFacts): {
  years: string | null;
  certifications: string | null;
  awards: string | null;
} {
  return {
    years: facts.yearsInBusiness,
    certifications: isSupportedClaim(facts.certifications) ? facts.certifications : null,
    awards: isSupportedClaim(facts.awards) ? facts.awards : null,
  };
}
