import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PremiumSite } from "./PremiumSite";
import { PREMIUM_FIXTURE } from "./premium-fixture";
import type { PremiumFacts } from "@/lib/builder/premium-mobile-template";

const sparse: PremiumFacts = {
  ...PREMIUM_FIXTURE,
  name: "Sample Plumbing", tagline: null, industry: "Plumbing", phone: null, phoneDisplay: null, email: null, address: null,
  serviceArea: null, yearsInBusiness: null, certifications: null, hero: null,
  services: PREMIUM_FIXTURE.services.map((s) => ({ ...s, image: null, href: null, detail: {} })),
};
const form = <form data-testid="form" />;

describe("PremiumSite", () => {
  it("renders the full fixture home with real-fact actions only", () => {
    const html = renderToStaticMarkup(<PremiumSite facts={PREMIUM_FIXTURE} page={{ kind: "home" }} form={form} />);
    expect(html).toContain("Showroom finish.");
    expect(html).toContain('href="tel:6140000142"');
    expect(html).toContain("https://www.google.com/maps/dir/?api=1&amp;destination=");
    expect(html).toContain('data-rv-bar="tabs"');
    expect(html).toContain('data-rv-slot="secondary"');
    expect(html).toContain('data-rv-slot="tertiary"');
    expect(html).toContain('class="pm-trust"');
    expect(html).toContain("Licensed &amp; insured");
    expect(html).toContain('data-testid="chat-launcher"');
    expect(html).toContain('id="quote"');
    expect(html).toContain('data-testid="form"');
    expect(html).toMatch(/fetchPriority="high"|fetchpriority="high"/);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("Learn more");
    // the template never adds prices, ratings, reviews, sms links or placeholder numbers
    expect(html).not.toMatch(/\$\s?\d|★|\breviews?\b|\brating\b|sms:|555-?\d{4}/i);
    // exactly one main landmark and one h1
    expect(html.match(/<main\b/g)?.length).toBe(1);
    expect(html.match(/<h1\b/g)?.length).toBe(1);
  });

  it("omits every fact-dependent block when the facts are missing", () => {
    const html = renderToStaticMarkup(<PremiumSite facts={sparse} page={{ kind: "home" }} form={form} />);
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("google.com/maps");
    expect(html).not.toContain('class="pm-trust"');
    expect(html).not.toContain('data-rv-slot="secondary"');
    expect(html).not.toContain('data-rv-slot="tertiary"');
    expect(html).toContain('data-rv-slot="primary"');
    expect(html).not.toContain("Learn more");
    expect(html).not.toContain("<img");
    expect(html).toContain("Sample Plumbing");
  });

  it("renders the owner's service detail with steps, inclusions and a CTA", () => {
    const service = PREMIUM_FIXTURE.services[0]!;
    const html = renderToStaticMarkup(<PremiumSite facts={PREMIUM_FIXTURE} page={{ kind: "service", service }} form={form} />);
    expect(html).toContain(service.detail.problem!);
    expect(html).toContain(service.detail.approach!);
    for (const step of service.detail.steps!) expect(html).toContain(step);
    for (const item of service.detail.included!) expect(html.replace(/&amp;/g, "&")).toContain(item);
    expect(html).toContain("More services");
    expect(html).not.toContain("Book this service");
  });

  it("drops service detail sections the owner did not write", () => {
    const service = { ...PREMIUM_FIXTURE.services[0]!, detail: {} };
    const html = renderToStaticMarkup(<PremiumSite facts={PREMIUM_FIXTURE} page={{ kind: "service", service }} form={form} />);
    expect(html).not.toContain('id="pm-steps"');
    expect(html).not.toContain('id="pm-included"');
  });

  it("shows page children only on plain pages", () => {
    const html = renderToStaticMarkup(<PremiumSite facts={PREMIUM_FIXTURE} page={{ kind: "other", title: "About" }} form={form}><p>owner sections</p></PremiumSite>);
    expect(html).toContain("owner sections");
  });
});
