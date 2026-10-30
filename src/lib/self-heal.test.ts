import { describe, expect, it } from "vitest";
import { planRepairs, repointLink, describeRepairs, type HealFacts } from "@/lib/self-heal";

const facts: HealFacts = {
  businessName: "Elite Mobile Detailing",
  city: "Raleigh",
  serviceArea: "Raleigh & Durham",
  phone: "(919) 555 0142",
  services: ["Full detail", "Interior clean"],
  siteSeoTitle: null,
  siteSeoDescription: null,
};

const page = (over: Partial<Parameters<typeof planRepairs>[0][number]> = {}) => ({
  id: "p1",
  slug: "home",
  title: "Home",
  kind: "home",
  is_visible: true,
  seo_title: null,
  seo_description: null,
  ...over,
});

describe("self-heal planner", () => {
  it("fills missing search details from real business facts only", () => {
    const repairs = planRepairs([page()], [], [], facts);
    const values = repairs.map((r) => r.value).join(" ");
    expect(repairs.some((r) => r.kind === "site_seo" && r.field === "title")).toBe(true);
    expect(repairs.filter((r) => r.kind === "page_seo")).toHaveLength(2);
    expect(values).toContain("Elite Mobile Detailing");
    expect(values).toContain("Raleigh & Durham");
    // no invented claims
    expect(values).not.toMatch(/award|licensed|guaranteed|5-star|best/i);
  });

  it("leaves complete pages alone", () => {
    const repairs = planRepairs(
      [page({ seo_title: "Home — Elite", seo_description: "Mobile detailing in Raleigh." })],
      [],
      [],
      { ...facts, siteSeoTitle: "Elite", siteSeoDescription: "Mobile detailing." },
    );
    expect(repairs).toHaveLength(0);
  });

  it("adds a headline only when a visible page has none", () => {
    const sections = [
      {
        id: "s1",
        page_id: "p1",
        kind: "hero",
        heading: null,
        body: null,
        is_visible: true,
        sort_order: 0,
      },
    ];
    const repairs = planRepairs([page()], sections, [], facts);
    const heading = repairs.find((r) => r.kind === "section_heading");
    expect(heading?.value).toBe("Home");

    const already = planRepairs([page()], [{ ...sections[0]!, heading: "Detailing" }], [], facts);
    expect(already.some((r) => r.kind === "section_heading")).toBe(false);
  });

  it("repoints unsafe and broken button links to a real destination", () => {
    const sections = [
      {
        id: "s1",
        page_id: "p1",
        kind: "hero",
        heading: "Hi",
        body: null,
        is_visible: true,
        sort_order: 0,
      },
    ];
    const components = [
      {
        id: "c1",
        section_id: "s1",
        kind: "cta_button",
        label: null,
        body: null,
        link_label: "Call us",
        link_url: "javascript:alert(1)",
        media_url: null,
      },
      {
        id: "c2",
        section_id: "s1",
        kind: "cta_button",
        label: null,
        body: null,
        link_label: "See services",
        link_url: "/nowhere",
        media_url: null,
      },
    ];
    const pages = [
      page(),
      { ...page({ id: "p2", slug: "services", title: "Services", kind: "page" }) },
    ];
    const repairs = planRepairs(pages, sections, components, facts);
    const links = repairs.filter((r) => r.kind === "component_link");
    expect(links).toHaveLength(2);
    expect(links[0]!.value).toBe("tel:9195550142");
    expect(links[1]!.value).toBe("/services");
  });

  it("describes an image from its own section, never from invention", () => {
    const sections = [
      {
        id: "s1",
        page_id: "p1",
        kind: "gallery",
        heading: "Recent work",
        body: null,
        is_visible: true,
        sort_order: 0,
      },
    ];
    const repairs = planRepairs(
      [page({ seo_title: "t", seo_description: "d" })],
      sections,
      [
        {
          id: "c9",
          section_id: "s1",
          kind: "image",
          label: null,
          body: null,
          link_label: null,
          link_url: null,
          media_url: "https://cdn.example.com/a.jpg",
        },
      ],
      { ...facts, siteSeoTitle: "t", siteSeoDescription: "d" },
    );
    const alt = repairs.find((r) => r.kind === "component_alt");
    expect(alt?.value).toContain("Recent work");
  });

  it("returns null when there is nowhere safe to point a button", () => {
    expect(
      repointLink(
        {
          id: "c1",
          section_id: "s1",
          kind: "cta_button",
          label: null,
          body: null,
          link_label: "Go",
          link_url: null,
          media_url: null,
        },
        [],
        { ...facts, phone: null },
      ),
    ).toBeNull();
  });

  it("summarises repairs in plain language", () => {
    const repairs = planRepairs([page()], [], [], facts);
    expect(describeRepairs(repairs)).toMatch(/page search details/);
    expect(describeRepairs([])).toMatch(/nothing/i);
  });
});

describe("self-heal verify step", () => {
  it("counts a repair as fixed only when a fresh read no longer plans it", async () => {
    const { verifiedRepairs, repairKey } = await import("@/lib/self-heal");
    const a = { kind: "page_seo", id: "p1", field: "seo_title", value: "Home — Acme", label: "home title" } as const;
    const b = { kind: "component_link", id: "c1", value: "/contact", label: "quote button" } as const;
    // The fresh read still plans b (its write did not land), with a different value.
    const result = verifiedRepairs([a, b], [{ ...b, value: "/" }]);
    expect(result.fixed.map((r) => r.label)).toEqual(["home title"]);
    expect(result.unverified.map((r) => r.label)).toEqual(["quote button"]);
    expect(repairKey({ kind: "site_seo", field: "title", value: "x", label: "x" })).toBe("site_seo:title");
  });
});
