import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SavingsCalculator } from "./SavingsCalculator";
import { SAVINGS_TOOLS } from "@/lib/software-savings";
import { GROWTH_SYSTEM } from "@/lib/offer";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
}));

describe("SavingsCalculator", () => {
  const html = renderToStaticMarkup(<SavingsCalculator />);

  it("pre-ticks nothing and invents no saving before the visitor chooses", () => {
    expect(html).not.toMatch(/checked=/);
    expect(html).not.toContain("less</p>");
    expect(html).toContain("Tick the tools you pay for");
  });

  it("offers every tool as a labelled checkbox and a labelled price field", () => {
    for (const tool of SAVINGS_TOOLS) {
      expect(html).toContain(`id="savings-${tool.id}"`);
      expect(html).toContain(`${tool.label}: your monthly cost in dollars`);
    }
  });

  it("states the canonical offer and labels the result as an estimate", () => {
    expect(html).toContain(`$${GROWTH_SYSTEM.monthlyPrice}/month`);
    expect(html).toContain("Estimate from your numbers");
    expect(html).not.toMatch(/guarantee(?!d? results)/i);
  });
});
