import { describe, expect, it } from "vitest";
import { buildAiSearchItem, buildSeoReview } from "./seo-review";

describe("buildSeoReview (G-A6)", () => {
  it("marks missing title/description and local fields as needs_work", () => {
    const items = buildSeoReview({
      seo: { headline: null, meta_description: null },
      businessName: "Acme",
      profile: { phone: null, email: null, address: null, city: null, state: null, zip: null },
      images: [],
      published: false,
    });
    expect(items.find((i) => i.id === "title_desc")?.status).toBe("needs_work");
    expect(items.find((i) => i.id === "local_business")?.status).toBe("needs_work");
    expect(items.find((i) => i.id === "sitemap")?.status).toBe("needs_work");
    expect(items.find((i) => i.id === "search_console")?.status).toBe("check");
  });

  it("passes when title, description, profile, alts, and publish are present", () => {
    const items = buildSeoReview({
      seo: {
        headline: "Mobile detailing in Raleigh NC",
        meta_description: "Book same-week mobile detailing for cars and trucks across Raleigh and nearby towns.",
      },
      businessName: "Acme",
      profile: {
        phone: "919-555-0100",
        email: "hi@acme.test",
        address: "1 Main St",
        city: "Raleigh",
        state: "NC",
        zip: "27601",
      },
      images: [
        { alt_text: "Polished sedan", status: "approved" },
        { alt_text: "Interior clean", status: "approved" },
      ],
      published: true,
    });
    expect(items.filter((i) => i.status === "ok").map((i) => i.id)).toEqual([
      "title_desc",
      "local_business",
      "alt_text",
      "sitemap",
    ]);
  });

  it("never invents alt counts when there are no image rows", () => {
    const alt = buildSeoReview({
      seo: null,
      businessName: null,
      profile: null,
      images: null,
      published: false,
    }).find((i) => i.id === "alt_text");
    expect(alt?.status).toBe("check");
    expect(alt?.detail).toMatch(/No site photos/);
  });
});

describe("AI search line (CG-08)", () => {
  const siteUrl = "https://revora.example/s/acme";
  const allowAll = "User-agent: *\nAllow: /\n";

  it("is Not verified when nothing was measured", () => {
    expect(buildAiSearchItem(null).status).toBe("check");
    expect(buildAiSearchItem(null).detail).toMatch(/^Not verified/);
    expect(buildAiSearchItem({ siteUrl, robotsTxt: null, llmsStatus: 200 }).status).toBe("check");
    expect(buildAiSearchItem({ siteUrl, robotsTxt: allowAll, llmsStatus: null }).status).toBe("check");
  });

  it("is ok only when robots allows the AI crawlers and llms.txt is live", () => {
    const item = buildAiSearchItem({ siteUrl, robotsTxt: allowAll, llmsStatus: 200 });
    expect(item.status).toBe("ok");
    expect(item.detail).toMatch(/^Measured:/);
  });

  it("names blocked crawlers and a missing llms.txt", () => {
    const item = buildAiSearchItem({ siteUrl, robotsTxt: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n", llmsStatus: 404 });
    expect(item.status).toBe("needs_work");
    expect(item.detail).toContain("GPTBot");
    expect(item.detail).not.toContain("ClaudeBot");
    expect(item.detail).toContain("llms.txt returned 404");
  });
});
