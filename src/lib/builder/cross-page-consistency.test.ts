import { describe, expect, it } from "vitest";
import { findCrossPageConsistencyFindings } from "./cross-page-consistency";

describe("cross-page consistency", () => {
  it("detects missing SEO titles and divergent CTA destinations", () => {
    const context = {
      pages: [{
        id: "p1", slug: "", title: "Home", kind: "home", is_visible: true, noindex: false,
        seo_title: null, seo_description: null,
        sections: [{
          id: "s1", kind: "hero", sort_order: 0, heading: "Welcome",
          subheading: null, body: null, components: [{
            id: "c1", kind: "button", label: "Book", body: null, link_url: "/old", link_label: "Book"
          }]
        }]
      }]
    } as never;
    const findings = findCrossPageConsistencyFindings(context, "/book", "Home");
    expect(findings.map((item) => item.kind)).toEqual(["cta", "title"]);
  });
});
