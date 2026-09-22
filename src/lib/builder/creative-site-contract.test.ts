import { describe, expect, it } from "vitest";
import {
  CREATIVE_SITE_CONTRACT_VERSION,
  mergeCreativeSiteContracts,
  validateCreativeSiteContract,
  type CreativeSiteContract,
} from "@/lib/builder/creative-site-contract";

const base = (): CreativeSiteContract => ({
  version: CREATIVE_SITE_CONTRACT_VERSION,
  revision: 1,
  authority: "sol",
  directedBy: "gpt-5.6-sol",
  reviewedBy: "gpt-5.6-terra",
  complete: true,
  identity: { concept: "editorial kinetic geometry" },
  pages: [
    {
      id: "page-home",
      slug: "home",
      title: "Home",
      purpose: "orient and convert",
      sections: [
        {
          id: "section-home-01",
          role: "immersive-intro",
          intent: "establish the visual idea",
          content: {
            heading: "A distinct opening",
            components: [
              {
                id: "button-01",
                kind: "button",
                label: "Start a conversation",
                linkLabel: "Start a conversation",
                linkUrl: "/contact",
              },
            ],
          },
          visual: {
            layout: "asymmetric-editorial",
            background: "linear-gradient(120deg,#111,#432)",
            transform: "translate3d(0,0,0)",
          },
        },
      ],
    },
  ],
});

describe("CreativeSiteContract", () => {
  it("accepts novel page and section roles without a vocabulary allow-list", () => {
    const result = validateCreativeSiteContract(base());
    expect(result.valid).toBe(true);
  });

  it("rejects deterministic template authority", () => {
    const contract = base();
    (contract.pages[0]!.sections[0]!.visual as Record<string, unknown>).templateId = "legacy";
    expect(validateCreativeSiteContract(contract).valid).toBe(false);
  });

  it("rejects executable markup while preserving creative freedom", () => {
    const contract = base();
    (contract.pages[0]!.sections[0]!.visual as Record<string, unknown>).css =
      "<script>alert(1)</script>";
    expect(validateCreativeSiteContract(contract).valid).toBe(false);
  });

  it("merges continuation chunks by stable IDs without deleting staged sections", () => {
    const chunk = base();
    chunk.revision = 2;
    chunk.pages[0]!.sections.push({
      id: "section-home-02",
      role: "interactive-proof",
      intent: "explain the process",
      content: { body: "Second chunk" },
    });
    const merged = mergeCreativeSiteContracts(base(), chunk);
    expect(merged.pages[0]!.sections.map((section) => section.id)).toEqual([
      "section-home-01",
      "section-home-02",
    ]);
    expect(merged.revision).toBe(2);
  });
});
