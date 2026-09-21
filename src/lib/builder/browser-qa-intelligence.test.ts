import { describe, expect, it } from "vitest";
import { runBrowserStyleQa } from "./browser-qa-intelligence";
import type { AgentContext } from "@/lib/site-agent.server";

describe("browser-style content intelligence", () => {
  it("flags visible template filler before a first build can be called polished", () => {
    const context = {
      pages: [{
        id: "home",
        slug: "home",
        title: "Your Business Name",
        seo_title: "Home",
        seo_description: "Local services",
        is_visible: true,
        noindex: false,
        sections: [{
          id: "hero",
          kind: "hero",
          heading: "Welcome to [business name]",
          subheading: null,
          body: null,
          is_visible: true,
          components: [],
        }],
      }],
    } as unknown as AgentContext;
    const report = runBrowserStyleQa(context);
    expect(report.findings.filter((finding) => finding.kind === "page")).toHaveLength(2);
    expect(report.score).toBeLessThan(100);
  });
});