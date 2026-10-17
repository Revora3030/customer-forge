import { describe, expect, it } from "vitest";
import { auditContentCompleteness, dataHandlingInventory, type CompletenessPage } from "./content-completeness";
import type { CompositionNode } from "./composition-tree";

const page = (slug: string, title: string, children: CompositionNode[]): CompletenessPage => ({
  slug,
  title,
  trees: [{ version: 1, root: { type: "stack", children } }],
});
const text = (value: string): CompositionNode => ({ type: "text", text: value });
const longPolicy = Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ");

describe("auditContentCompleteness", () => {
  it("flags a privacy page that says the policy was not supplied", () => {
    const findings = auditContentCompleteness({
      pages: [page("privacy", "Privacy", [text(`A detailed privacy policy has not been supplied yet. ${longPolicy}`)])],
      services: [],
    });
    expect(findings.map((f) => f.code)).toEqual(["legal_placeholder"]);
  });

  it("flags a legal page too thin to be a policy, and passes a full one", () => {
    expect(auditContentCompleteness({ pages: [page("privacy", "Privacy", [text("Ask us about privacy.")])], services: [] })[0]?.code).toBe("legal_too_thin");
    expect(auditContentCompleteness({ pages: [page("terms", "Terms", [text(longPolicy)])], services: [] })).toEqual([]);
  });

  it("flags a gallery page with no pictures but not one with images", () => {
    expect(auditContentCompleteness({ pages: [page("gallery", "Gallery", [text("A closer look.")])], services: [] })[0]?.code).toBe("gallery_without_images");
    expect(
      auditContentCompleteness({ pages: [page("gallery", "Gallery", [{ type: "media", src: "https://x.example/a.jpg", alt: "Detailed dashboard" }])], services: [] }),
    ).toEqual([]);
    expect(auditContentCompleteness({ pages: [page("how-we-work", "How we work", [text("Steps.")])], services: [] })).toEqual([]);
  });

  it("flags priced services that never say what is included", () => {
    const findings = auditContentCompleteness({
      pages: [],
      services: [
        { name: "Full", description: null, price: 150, startingPrice: null },
        { name: "Interior", description: "Vacuum, shampoo seats and mats, wipe every surface, clean glass.", price: 90, startingPrice: null },
        { name: "Ask us", description: null, price: null, startingPrice: null },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "service_without_inclusions", subject: "Full" });
  });
});

describe("dataHandlingInventory", () => {
  it("states only real facts and lists unknowns for the owner", () => {
    const out = dataHandlingInventory({
      businessName: "Elite Mobile Detail",
      contactEmail: "hello@elite.example",
      collectedFields: ["Name", "phone", "email", "name", "Details"],
      hasQuoteForm: true,
      hasBooking: false,
      analyticsEnabled: false,
    });
    expect(out.statements[0]).toBe("The site's forms collect: name, phone, email, details.");
    expect(out.statements.join(" ")).not.toMatch(/booking/);
    expect(out.statements.join(" ")).toContain("does not run visitor analytics");
    expect(out.unknowns.length).toBeGreaterThan(0);
  });
});
