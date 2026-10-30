import { describe, expect, it } from "vitest";
import { parsePreviewInput, parsePublicSiteInput } from "./public-site.functions";

describe("malformed public addresses answer not-found instead of a server error", () => {
  it("accepts well-formed site addresses unchanged", () => {
    expect(parsePublicSiteInput({ slug: "oak-city-plumbing" })).toEqual({
      slug: "oak-city-plumbing",
    });
    expect(parsePublicSiteInput({ slug: " oak-city ", pageSlug: "services" })).toEqual({
      slug: "oak-city",
      pageSlug: "services",
    });
  });

  it("flags malformed site slugs and pages without throwing", () => {
    for (const input of [
      { slug: "BAD_SLUG!" },
      { slug: "" },
      { slug: "ok", pageSlug: "Bad Page" },
      null,
    ]) {
      expect(() => parsePublicSiteInput(input as never)).not.toThrow();
      expect(parsePublicSiteInput(input as never)).toEqual({ slug: "", invalid: true });
    }
  });

  it("accepts well-formed preview tokens", () => {
    expect(parsePreviewInput({ token: "abcdefghijklmnopqrstuvwx" })).toEqual({
      token: "abcdefghijklmnopqrstuvwx",
    });
    expect(parsePreviewInput({ token: "abcdefghijklmnop_-12", pageSlug: "about" })).toEqual({
      token: "abcdefghijklmnop_-12",
      pageSlug: "about",
    });
  });

  it("flags malformed preview tokens without throwing", () => {
    for (const input of [
      { token: "badtoken" },
      { token: "has spaces in the token!!" },
      { token: "abcdefghijklmnopqrstuvwx", pageSlug: "Nope!" },
      undefined,
    ]) {
      expect(() => parsePreviewInput(input as never)).not.toThrow();
      expect(parsePreviewInput(input as never)).toEqual({ token: "", invalid: true });
    }
  });

  it("server functions short-circuit invalid input before touching the database", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./public-site.functions.ts", import.meta.url), "utf8");
    expect(src).not.toContain('throw new Error("Invalid preview link")');
    expect(src).toMatch(
      /parsePublicSiteInput\(input\)\)\s*\.handler\(async \(\{ data \}\) => \{[\s\S]{0,200}if \(data\.invalid\) return null;/,
    );
    expect(src).toMatch(
      /parsePreviewInput\(input\)\)\s*\.handler\(async \(\{ data \}\) => \{[\s\S]{0,300}if \(data\.invalid\)/,
    );
  });
});
