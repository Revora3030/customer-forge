import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  countryLabel,
  languageInstruction,
  normalizeCountry,
  normalizeSiteLanguage,
  siteHtmlLang,
  siteLanguageName,
} from "./site-language";
import { SERVED_COUNTRIES, findCountry } from "./world-countries";

describe("site language", () => {
  it("normalises codes, labels and free-typed names", () => {
    expect(normalizeSiteLanguage("es")).toBe("es");
    expect(normalizeSiteLanguage("Spanish")).toBe("es");
    expect(normalizeSiteLanguage("Spanish (Español)")).toBe("es");
    expect(normalizeSiteLanguage("Yoruba")).toBe("Yoruba");
    expect(normalizeSiteLanguage("")).toBeNull();
    expect(normalizeSiteLanguage("<script>")).toBeNull();
  });

  it("produces html lang only for known languages", () => {
    expect(siteHtmlLang("French")).toBe("fr");
    expect(siteHtmlLang("Yoruba")).toBeNull();
    expect(siteHtmlLang(null)).toBeNull();
  });

  it("tells the AI the exact language when one is chosen", () => {
    expect(languageInstruction("de")).toContain("German");
    expect(languageInstruction(null)).toContain("same language the owner used");
    expect(siteLanguageName("pt")).toBe("Portuguese (Português)");
  });
});

describe("country", () => {
  it("accepts ISO codes and full names", () => {
    expect(normalizeCountry("gb")).toBe("GB");
    expect(normalizeCountry("Canada")).toBe("CA");
    expect(normalizeCountry("Atlantis")).toBeNull();
    expect(countryLabel("NG")).toBe("Nigeria");
  });

  it("serves unique, findable country pages", () => {
    const slugs = SERVED_COUNTRIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(findCountry("united-kingdom")?.code).toBe("GB");
    expect(findCountry("nowhere")).toBeUndefined();
  });
});

describe("checkout tax", () => {
  const source = readFileSync("src/lib/stripe.functions.ts", "utf8");
  it("lets Stripe save the billing address so automatic tax can run", () => {
    expect(source.match(/customer_update: \{ address: "auto"/g)?.length).toBe(2);
    expect(source.match(/billing_address_collection: "required"/g)?.length).toBe(2);
    expect(source.match(/tax_id_collection: \{ enabled: true \}/g)?.length).toBe(2);
  });
});
