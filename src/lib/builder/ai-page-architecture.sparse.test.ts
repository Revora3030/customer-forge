import { beforeEach, describe, expect, it, vi } from "vitest";

const { thinker } = vi.hoisted(() => ({ thinker: vi.fn() }));
vi.mock("@/lib/ai/thinker.server", () => ({ callBestThinker: thinker }));

import { proposePageArchitecture } from "@/lib/builder/ai-page-architecture.server";

const candidate = ["home", "about", "contact"].map((slug) => ({
  slug,
  title: slug,
  purpose: slug,
  primaryAction: "Call",
  sections: [{ role: "hero" }, { role: "contact" }],
})) as never;

describe("sparse input (name, trade and place only)", () => {
  beforeEach(() => thinker.mockReset());

  it("asks for a complete small site, never a one-page stub, and bans invented proof", async () => {
    thinker.mockResolvedValue({ ok: false, reason: "capacity", detail: null });
    await proposePageArchitecture({
      organizationId: "org",
      businessName: "Acme Detailing",
      industry: "Mobile detailing",
      conversionGoal: null,
      candidate,
      description: "Mobile detailing serving Durham, NC.",
      services: [],
    });
    const prompt = String(thinker.mock.calls[0]?.[0]?.user ?? "");
    expect(prompt).toContain("SPARSE FACTS");
    expect(prompt).toMatch(/Plan three pages/);
    expect(prompt).not.toMatch(/exactly one page/i);
    for (const banned of ["prices", "reviews", "awards", "licences", "guarantees", "response times"]) {
      expect(prompt).toContain(banned);
    }
  });

  it("does not use sparse mode when real services exist", async () => {
    thinker.mockResolvedValue({ ok: false, reason: "capacity", detail: null });
    await proposePageArchitecture({
      organizationId: "org",
      businessName: "Acme Detailing",
      industry: "Mobile detailing",
      conversionGoal: null,
      candidate,
      description: null,
      services: ["Interior detail"],
    });
    expect(String(thinker.mock.calls[0]?.[0]?.user ?? "")).not.toContain("SPARSE FACTS");
  });
});
