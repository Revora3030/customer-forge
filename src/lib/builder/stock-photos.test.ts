import { describe, expect, it } from "vitest";
import {
  buildStockQuery,
  creditLines,
  licenceAllowsBusinessUse,
  licenceLine,
  normaliseStockResults,
  requiresCredit,
  stockMediaRow,
  type StockPhoto,
} from "./stock-photos";

const photo = (over: Partial<StockPhoto> = {}): StockPhoto => ({
  id: "a1",
  title: "Bakery counter",
  url: "https://example.org/a1.jpg",
  thumbnail: "https://example.org/a1-small.jpg",
  provider: "flickr",
  creator: "Sam",
  licenseCode: "by",
  licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  attribution: '"Bakery counter" by Sam is licensed under CC BY 2.0.',
  sourcePage: "https://flickr.com/photo/1",
  width: 1600,
  height: 1000,
  ...over,
});

describe("licence safety", () => {
  it("allows commercial licences", () => {
    for (const code of ["cc0", "by", "by-sa", "pdm"]) {
      expect(licenceAllowsBusinessUse(code)).toBe(true);
    }
  });

  it("refuses non-commercial and no-derivative licences", () => {
    for (const code of ["by-nc", "by-nc-sa", "by-nd", "BY-NC-ND"]) {
      expect(licenceAllowsBusinessUse(code)).toBe(false);
    }
  });

  it("refuses a missing licence rather than guessing", () => {
    expect(licenceAllowsBusinessUse(null)).toBe(false);
    expect(licenceAllowsBusinessUse("")).toBe(false);
    expect(licenceAllowsBusinessUse(" ")).toBe(false);
  });

  it("knows which licences need a credit line", () => {
    expect(requiresCredit("by")).toBe(true);
    expect(requiresCredit("by-sa")).toBe(true);
    expect(requiresCredit("cc0")).toBe(false);
    expect(requiresCredit("PDM")).toBe(false);
  });

  it("explains the licence in plain words", () => {
    expect(licenceLine(photo())).toContain("credit line must stay");
    expect(licenceLine(photo({ licenseCode: "cc0" }))).toContain("public domain");
    expect(licenceLine(photo({ creator: null }))).toContain("unnamed photographer");
  });
});

describe("search phrase", () => {
  it("combines what was typed with the trade", () => {
    expect(buildStockQuery("shop front", "bakery")).toBe("shop front bakery");
  });

  it("does not repeat the trade when already typed", () => {
    expect(buildStockQuery("bakery counter", "bakery")).toBe("bakery counter");
  });

  it("falls back to the trade and strips punctuation", () => {
    expect(buildStockQuery("", "dental clinic")).toBe("dental clinic");
    expect(buildStockQuery("<script>x</script>", null)).toBe("script x script");
  });
});

describe("normalising library results", () => {
  const raw = {
    results: [
      {
        id: "1",
        title: "Bakery",
        url: "https://img/1.jpg",
        thumbnail: "https://img/1s.jpg",
        creator: "Ann",
        license: "by-sa",
        license_version: "2.0",
        license_url: "https://cc/by-sa",
        provider: "flickr",
        foreign_landing_url: "https://flickr/1",
        width: 1200,
        height: 800,
      },
      { id: "2", title: "Paid", url: "https://img/2.jpg", license: "by-nc", provider: "x" },
      { id: "3", title: "No licence", url: "https://img/3.jpg", provider: "x" },
      { id: "4", title: "Insecure", url: "http://img/4.jpg", license: "cc0", provider: "x" },
      { id: "1", title: "Duplicate", url: "https://img/1.jpg", license: "cc0", provider: "flickr" },
      "nonsense",
    ],
  };

  it("keeps only usable, secure, unique pictures", () => {
    const photos = normaliseStockResults(raw);
    expect(photos).toHaveLength(1);
    expect(photos[0]!.id).toBe("1");
    expect(photos[0]!.attribution).toContain("Ann");
    expect(photos[0]!.width).toBe(1200);
  });

  it("returns nothing for a broken response", () => {
    expect(normaliseStockResults(null)).toEqual([]);
    expect(normaliseStockResults({ results: "x" })).toEqual([]);
    expect(normaliseStockResults({})).toEqual([]);
  });

  it("builds an attribution when the library omits one", () => {
    const photos = normaliseStockResults({
      results: [{ id: "9", title: "Door", url: "https://img/9.jpg", license: "by", provider: "wikimedia" }],
    });
    expect(photos[0]!.attribution).toBe('"Door" by unknown is licensed under CC BY.');
  });
});

describe("saving a picture", () => {
  it("records licence, credit, creator and source page", () => {
    const row = stockMediaRow(photo());
    expect(row).toMatchObject({
      url: "https://example.org/a1.jpg",
      source: "stock:flickr",
      license: "by",
      license_url: "https://creativecommons.org/licenses/by/2.0/",
      creator: "Sam",
      source_page: "https://flickr.com/photo/1",
    });
    expect(row.attribution).toContain("CC BY");
    expect(row.alt_text).toBe("Bakery counter");
  });

  it("uses supplied alt text when given", () => {
    expect(stockMediaRow(photo(), "Fresh bread on a wooden counter").alt_text).toBe(
      "Fresh bread on a wooden counter",
    );
  });
});

describe("credit lines for a published site", () => {
  it("lists each required credit once and skips public domain", () => {
    expect(
      creditLines([
        { license: "by", attribution: "A by X" },
        { license: "by", attribution: "A by X" },
        { license: "cc0", attribution: "B by Y" },
        { license: null, attribution: "C" },
        { license: "by-sa", attribution: "D by Z" },
      ]),
    ).toEqual(["A by X", "D by Z"]);
  });
});
