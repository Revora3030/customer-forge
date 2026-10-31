/** Audit P2-06: the business footer shows its street address and hours, has 44px link targets, and a stable year. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site/SiteFooter";
import { OwnAddressContext } from "@/components/site/site-address-context";

const site = {
  org: { name: "Harbor Line Plumbing", slug: "harbor" },
  profile: {
    tagline: null,
    phone: "(919) 482-7731",
    email: "office@harborline.com",
    address: "412 Elm Street",
    city: "Raleigh",
    state: "NC",
    zip: "27601",
    hours: "Mon-Fri 8am-5pm",
  },
  social: { facebook: "https://facebook.com/harborline" },
  nav: [
    { slug: "home", title: "Home", kind: "home" },
    { slug: "services", title: "Services", kind: "page" },
  ],
} as never;

const html = (year?: number) =>
  renderToStaticMarkup(
    <OwnAddressContext.Provider value={true}>
      <SiteFooter site={site} {...(year ? { year } : {})} />
    </OwnAddressContext.Provider>,
  );

describe("SiteFooter", () => {
  it("shows the street address and hours the owner gave", () => {
    const out = html();
    expect(out).toContain("412 Elm Street");
    expect(out).toContain("Mon-Fri 8am-5pm");
  });
  it("gives every link a 44px target", () => {
    const anchors = html().match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    for (const tag of anchors) expect(tag).toMatch(/min-h-11/);
  });
  it("prints the year it was given, so the server and browser agree", () => {
    expect(html(2027)).toContain("2027");
    expect(html(2027)).not.toContain("2026");
  });

  it("shows a Book online link only for a valid https booking link", () => {
    const withLink = (hours: unknown) =>
      renderToStaticMarkup(
        <OwnAddressContext.Provider value={true}>
          <SiteFooter site={{ ...(site as object), profile: { ...(site as { profile: object }).profile, hours } } as never} />
        </OwnAddressContext.Provider>,
      );
    const good = withLink({ summary: "Mon-Fri 8am-5pm", booking_url: "https://calendly.com/harbor" });
    expect(good).toContain('href="https://calendly.com/harbor"');
    expect(good).toContain("Book online");
    expect(good).toContain('rel="noopener noreferrer"');
    expect(withLink({ booking_url: "javascript:alert(1)" })).not.toContain("Book online");
    expect(withLink({ booking_url: "http://calendly.com/harbor" })).not.toContain("Book online");
    expect(html()).not.toContain("Book online");
  });
});
