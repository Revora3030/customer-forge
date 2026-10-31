import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WhatRevoraReplaces } from "@/components/marketing/WhatRevoraReplaces";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { OFFER_FEATURES, REPLACED_TOOLS, REPLACES_HEADING } from "@/lib/what-revora-replaces";

const root = process.cwd();
const html = renderToStaticMarkup(<WhatRevoraReplaces />);
/** Rendered text, tags removed, so a pattern cannot hide in markup. */
const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
const dataText = JSON.stringify(REPLACED_TOOLS);

/** The only dollar amounts allowed are Revora's own, from the offer module. */
const OWN_FIGURES = new Set([usd(GROWTH_SYSTEM.setupPrice), usd(GROWTH_SYSTEM.monthlyPrice)]);

describe("What Revora replaces", () => {
  it("renders the heading and one card per category", () => {
    expect(text).toContain(REPLACES_HEADING);
    for (const tool of REPLACED_TOOLS) expect(text).toContain(tool.category);
    expect(html.match(/<li /g)?.length).toBe(REPLACED_TOOLS.length);
  });

  it("has unique ids", () => {
    expect(new Set(REPLACED_TOOLS.map((t) => t.id)).size).toBe(REPLACED_TOOLS.length);
  });

  it("only lists features the offer already advertises", () => {
    for (const tool of REPLACED_TOOLS) {
      expect(OFFER_FEATURES, `${tool.id}: ${tool.offerFeature}`).toContain(tool.offerFeature);
    }
  });

  it("has real code behind every row", () => {
    for (const tool of REPLACED_TOOLS) {
      expect(tool.evidence.length, tool.id).toBeGreaterThan(0);
      for (const file of tool.evidence) {
        expect(existsSync(resolve(root, file)), `${tool.id}: ${file}`).toBe(true);
      }
    }
  });

  it("states no dollar figure except Revora's own offer", () => {
    const figures = text.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? [];
    expect(figures.length).toBeGreaterThan(0);
    for (const figure of figures) expect(OWN_FIGURES.has(figure.replace(/\s/g, "")), figure).toBe(true);
    expect(dataText).not.toMatch(/\$\s?\d/);
    expect(text).toContain(`${usd(GROWTH_SYSTEM.setupPrice)} setup`);
    expect(text).toContain("first month free");
    expect(text).toContain(`${usd(GROWTH_SYSTEM.monthlyPrice)}/month`);
  });

  it("makes no rating, review-count, award, 24/7, phone or savings-amount claim", () => {
    const banned: [string, RegExp][] = [
      ["star rating", /★|\bstars?\b|\b\d(\.\d)?\s*\/\s*5\b|\brated\b|\brating\b/i],
      ["review count", /\b\d[\d,]*\+?\s+(reviews?|customers?|clients?|businesses|shops|owners|sites|users)\b/i],
      ["award", /\baward|\bwinning\b|\bbest[- ]in\b|#\s?1\b|\bnumber one\b/i],
      ["24/7", /24\s*\/\s*7|24 hours|around the clock/i],
      ["phone number", /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\btel:/i],
      ["savings promise", /\bsave (up to|\$|\d)|\b\d+\s?%|\bguarantee/i],
      ["text messages", /\btext messag|\bsms\b/i],
    ];
    for (const [name, pattern] of banned) {
      expect(text, name).not.toMatch(pattern);
      expect(dataText, name).not.toMatch(pattern);
    }
  });

  it("names no competing brand", () => {
    const brands = /\b(wix|squarespace|webflow|calendly|acuity|typeform|jotform|hubspot|pipedrive|mailchimp|constant contact|zapier|podium|birdeye|godaddy|wordpress|shopify|yelp)\b/i;
    expect(text).not.toMatch(brands);
    expect(dataText).not.toMatch(brands);
  });
});
