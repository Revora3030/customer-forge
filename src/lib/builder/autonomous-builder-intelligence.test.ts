import { describe, expect, it } from "vitest";
import { auditAutonomousBuilder, buildAutonomousTaskPlan } from "./autonomous-builder-intelligence";
import type { AgentContext } from "@/lib/site-agent.server";

const context = {
  business: {
    name: "Acme", industry: "Services", tagline: "Quality service", description: "A real business description",
    city: "Carrboro", state: "NC", serviceArea: "Carrboro", phone: null, email: "test@example.com",
    yearsInBusiness: null, primaryColor: null, secondaryColor: null, accentColor: null, fontPreference: null,
    services: [{ name: "Service", price: null, startingPrice: null }], publishedReviewCount: 0, photoCount: 0,
  },
  pages: [{
    id: "home", slug: "", title: "Home", kind: "home", is_visible: true, noindex: false,
    seo_title: "Acme", seo_description: "Quality service for local customers.",
    sections: [{
      id: "hero", kind: "hero", variant: "default", is_visible: true, heading: "Welcome",
      subheading: "Quality service", body: "Real content ".repeat(30), sort_order: 0,
      components: [{ id: "button", kind: "button", label: "Book today", body: null, link_label: "Book today", link_url: "/book", sort_order: 0 }],
    }, {
      id: "services", kind: "services", variant: "default", is_visible: true, heading: "Services",
      subheading: null, body: "Our services", sort_order: 1,
      components: [{ id: "service", kind: "card", label: "Service", body: "Details", link_label: null, link_url: null, sort_order: 0 }],
    }],
  }],
} as AgentContext;

describe("autonomous-builder-intelligence", () => {
  it("decomposes complex requests into dependent quality tasks", () => {
    const tasks = buildAutonomousTaskPlan([], "make the whole site premium, mobile friendly, accessible, SEO optimized and better for bookings");
    expect(tasks.some((task) => task.id === "design")).toBe(true);
    expect(tasks.some((task) => task.id === "responsive")).toBe(true);
    expect(tasks.some((task) => task.id === "seo")).toBe(true);
    expect(tasks.some((task) => task.id === "a11y")).toBe(true);
    expect(tasks.some((task) => task.id === "conversion")).toBe(true);
    expect(tasks.find((task) => task.id === "execute")?.status).toBe("blocked");
  });

  it("produces a deterministic whole-builder quality audit", () => {
    const first = auditAutonomousBuilder(context, [], "make the site better");
    const second = auditAutonomousBuilder(context, [], "make the site better");
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.context.nodes.length).toBeGreaterThan(0);
    expect(first.blueprint.totalActions).toBe(0);
    expect(first.capabilities.runtime).toBe("requires-runtime");
  });
});
