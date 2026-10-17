import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractFacts, foundLabels, formatPhone, mergeFacts, nextPages } from "@/lib/site-import";

const HOME = `<html><head><title>Triangle Comfort HVAC | Raleigh AC Repair</title>
<meta name="description" content="Family-owned heating &amp; cooling in Raleigh since 2009.">
<meta name="theme-color" content="#1A73E8"><meta property="og:image" content="/img/van.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"HVACBusiness","name":"Triangle Comfort HVAC","telephone":"+1 919-555-0142","email":"hello@trianglecomfort.com","address":{"streetAddress":"12 Main St","addressLocality":"Raleigh","addressRegion":"NC","postalCode":"27601"},"openingHoursSpecification":[{"dayOfWeek":["Monday","Tuesday"],"opens":"08:00","closes":"17:00"}],"sameAs":["https://www.facebook.com/trianglecomfort"],"logo":"https://trianglecomfort.com/logo.png"}</script>
</head><body><a href="/services">Services</a><a href="/about-us">About</a><a href="/contact">Contact</a>
<a href="/services/ac-repair">AC Repair</a><a href="/services/furnace-install">Furnace Installation</a>
<a href="https://instagram.com/trianglecomfort">IG</a><a href="https://other.example/services">x</a></body></html>`;

describe("importing an existing website", () => {
  it("reads the facts a business publishes, from structured data and links", () => {
    const facts = extractFacts(HOME, "https://trianglecomfort.com/");
    expect(facts).toMatchObject({
      businessName: "Triangle Comfort HVAC",
      about: "Family-owned heating & cooling in Raleigh since 2009.",
      phone: "(919) 555-0142",
      email: "hello@trianglecomfort.com",
      address: "12 Main St, Raleigh, NC 27601",
      city: "Raleigh",
      state: "NC",
      hours: "Monday, Tuesday 08:00–17:00",
      logoUrl: "https://trianglecomfort.com/logo.png",
      heroImageUrl: "https://trianglecomfort.com/img/van.jpg",
      primaryColor: "#1a73e8",
      instagram: "https://instagram.com/trianglecomfort",
      facebook: "https://www.facebook.com/trianglecomfort",
    });
    expect(facts.services.map((service) => service.name)).toEqual(["AC Repair", "Furnace Installation"]);
  });

  it("follows only the site's own services, about and contact pages", () => {
    const facts = extractFacts(HOME, "https://trianglecomfort.com/");
    expect(nextPages(facts.links, "https://trianglecomfort.com/")).toEqual([
      "https://trianglecomfort.com/services",
      "https://trianglecomfort.com/about-us",
      "https://trianglecomfort.com/contact",
    ]);
  });

  it("pools services across pages and keeps the first page's facts", () => {
    const home = extractFacts(HOME, "https://trianglecomfort.com/");
    const services = extractFacts("<h2>Duct Cleaning</h2><h2>Contact Us</h2><h3>Heat Pump Repair</h3><p>call 919.555.0199</p>", "https://trianglecomfort.com/services");
    const merged = mergeFacts([home, services]);
    expect(merged.services.map((service) => service.name)).toEqual(["AC Repair", "Furnace Installation", "Duct Cleaning", "Heat Pump Repair"]);
    expect(merged.phone).toBe("(919) 555-0142");
    expect(foundLabels(merged)).toContain("4 services");
  });

  it("works on plain sites without structured data and never resolves an empty image to the page", () => {
    const facts = extractFacts(`<title>Joe's Plumbing - Durham</title><a href="tel:9195550100">Call</a><a href="mailto:joe@joes.com?subject=hi">Mail</a><img class="site-logo" src="logo.svg">`, "https://joes.com/");
    expect([facts.businessName, facts.phone, facts.email, facts.logoUrl, facts.heroImageUrl]).toEqual([
      "Joe's Plumbing",
      "(919) 555-0100",
      "joe@joes.com",
      "https://joes.com/logo.svg",
      "",
    ]);
    expect(formatPhone("no number here")).toBe("");
  });

  it("fetches safely and saves only into empty fields for a manager", () => {
    const server = readFileSync("src/lib/site-import.server.ts", "utf8");
    expect(server).toContain("guardedFetch(url");
    expect(server).toContain("validatePublicWebsiteUrl(new URL(location, url).toString())");
    expect(server).toContain("remaining -= chunk.byteLength");
    const fns = readFileSync("src/lib/site-import.functions.ts", "utf8");
    expect(fns).toContain('requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager")');
    expect(fns).toContain('if (value && !String(existing[column] ?? "").trim())');
    expect(fns).toContain("if ((count ?? 0) === 0)");
  });
});
