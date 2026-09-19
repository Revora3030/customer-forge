import { describe, expect, it } from "vitest";

import { buildVerificationContract } from "./autonomous-verification";
import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

const context = {
  pages: [
    {
      id: "home",
      slug: "/",
      title: "Home",
      kind: "home",
      sections: [],
    },
  ],
} as unknown as AgentContext;

describe("autonomous verification contract", () => {
  it("requires runtime evidence for browser-dependent quality", () => {
    const actions: AgentAction[] = [
      { type: "set_theme", patch: { primary_color: "#111111" } },
      {
        type: "add_component",
        sectionId: "hero",
        kind: "button",
        label: "Book",
        link_url: "/book",
        link_label: "Book",
      },
    ];

    const contract = buildVerificationContract(context, actions, "improve conversion");

    expect(contract.checks.some((check) => check.id === "cta-path")).toBe(true);
    expect(contract.runtimeChecks).toContain("compare desktop, tablet and mobile screenshots");
    expect(contract.runtimeChecks).toContain("keyboard traversal");
    expect(contract.summary).toMatch(/Verification contract/);
  });

  it("requires rollback for destructive plans", () => {
    const actions: AgentAction[] = [
      { type: "delete_page", pageId: "home" },
      { type: "delete_section", sectionId: "hero" },
    ];

    const contract = buildVerificationContract(context, actions, "remove the old page");

    expect(contract.rollbackRequired).toBe(true);
    expect(contract.risk).toMatch(/high|critical/);
    expect(contract.blockers.join(" ")).toMatch(/snapshot|rollback/i);
  });
});
