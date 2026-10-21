import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FAQ, FAQ_ITEMS } from "@/components/marketing/FAQ";
import { HOME_HEADLINE, HOME_TRIAL_CHARGE_NOTE, marketingHomeHead } from "./home-head";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";

type Schema = Record<string, unknown>;

function schemas(): Schema[] {
  return marketingHomeHead().scripts.map((script) => {
    expect(script.type).toBe("application/ld+json");
    expect(script.children).not.toContain("<");
    return JSON.parse(script.children) as Schema;
  });
}

const byType = (type: string) => schemas().find((schema) => schema["@type"] === type);

// One decoding pass, so "&amp;lt;" stays the text "&lt;".
const ENTITIES: Record<string, string> = { "#x27": "'", quot: '"', amp: "&", lt: "<", gt: ">" };
const decode = (html: string) => html.replace(/&(#x27|quot|amp|lt|gt);/g, (entity, name: string) => ENTITIES[name] ?? entity);

describe("homepage structured data", () => {
  it("emits the FAQPage from exactly the FAQ the page renders", () => {
    const faq = byType("FAQPage");
    expect(faq).toBeDefined();
    const entities = faq!["mainEntity"] as { name: string; acceptedAnswer: { text: string } }[];
    expect(entities.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      FAQ_ITEMS.map((item) => [item.q, item.a]),
    );
    const rendered = decode(renderToStaticMarkup(<FAQ />));
    for (const entity of entities) {
      expect(rendered).toContain(entity.name);
      expect(rendered).toContain(entity.acceptedAnswer.text);
    }
  });

  it("carries one offer record whose prices are the offer.ts constants", () => {
    const all = schemas();
    expect(all.filter((schema) => schema["@type"] === "Service")).toHaveLength(1);
    const service = byType("Service")!;
    expect(service["name"]).toBe(GROWTH_SYSTEM.name);
    const offers = service["offers"] as Schema[];
    const setup = offers.find((offer) => offer["name"] === "One-time setup")!;
    expect(setup).toMatchObject({ price: GROWTH_SYSTEM.setupPrice, priceCurrency: "USD" });
    const monthly = offers.find((offer) => offer["name"] === "Platform subscription")!;
    expect(monthly["priceSpecification"]).toMatchObject({
      price: GROWTH_SYSTEM.monthlyPrice,
      priceCurrency: "USD",
      unitText: "MONTH",
    });
    // Constants, not copies: 350 setup and 100/month today.
    expect([GROWTH_SYSTEM.setupPrice, GROWTH_SYSTEM.monthlyPrice]).toEqual([350, 100]);
  });

  it("never invents reviews, ratings or product identifiers", () => {
    const text = marketingHomeHead().scripts.map((s) => s.children).join("\n");
    expect(text).not.toMatch(/aggregateRating|"review"|"sku"|"gtin/);
  });

  it("states the offer prices in the meta description from offer.ts", () => {
    const description = marketingHomeHead().meta.find(
      (entry) => "name" in entry && entry.name === "description",
    ) as { content: string };
    expect(description.content).toContain(`${usd(GROWTH_SYSTEM.monthlyPrice)}/month`);
    expect(description.content).toContain(`${usd(GROWTH_SYSTEM.setupPrice)} one-time setup`);
  });
});

describe("homepage hero and pricing copy", () => {
  const route = readFileSync("src/routes/index.tsx", "utf8");

  it("uses a benefit headline as the H1 and keeps the brand beside it", () => {
    expect(HOME_HEADLINE).not.toMatch(/\d|guarantee|%|\$/i);
    expect(route).toMatch(/<h1[^>]*>\s*\{HOME_HEADLINE\}\s*<\/h1>/);
    expect(route).toContain("Revora Growth Systems™");
  });

  it("explains the trial charge before the shared checkout disclosure", () => {
    expect(HOME_TRIAL_CHARGE_NOTE).toBe(
      `Nothing is charged during your ${GROWTH_SYSTEM.fullAccessWindow} of free access. The ${usd(GROWTH_SYSTEM.setupPrice)} setup is charged when you choose to launch.`,
    );
    const note = route.indexOf("{HOME_TRIAL_CHARGE_NOTE}");
    const disclosure = route.indexOf("{GROWTH_SYSTEM.explainer}");
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(disclosure);
  });
});
