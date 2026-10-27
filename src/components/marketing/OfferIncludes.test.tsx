import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfferIncludes } from "./OfferIncludes";
import { GROWTH_SYSTEM } from "@/lib/offer";

describe("OfferIncludes", () => {
  const html = renderToStaticMarkup(<OfferIncludes />);

  it("lists every setup and monthly inclusion from the canonical offer", () => {
    for (const item of [...GROWTH_SYSTEM.setupIncludes, ...GROWTH_SYSTEM.monthlyIncludes]) expect(html).toContain(item);
  });

  it("states no price or figure of its own", () => {
    expect(html).not.toMatch(/\$\d/);
  });
});
