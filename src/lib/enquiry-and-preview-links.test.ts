import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSiteHref } from "@/lib/builder/site-chrome";
import { COMPOSITION_WIDGETS } from "@/lib/builder/composition-tree";
import { needsEnquiryForm } from "@/components/site/site-sections-utils";
import { captureQa } from "@/lib/launch-qa";
import { settingsHaveWidget } from "@/lib/site-brief.server";

const tree = (widget: string) => ({
  composition: { version: 1, label: "x", root: { type: "stack", children: [{ type: "widget", text: widget }] } },
});

describe("links inside a preview stay on the preview", () => {
  it("rewrites page links to the share-link base", () => {
    expect(resolveSiteHref("/contact#contact-form", "elite", false, null, null, "/p/abc123")).toBe("/p/abc123/contact#contact-form");
    expect(resolveSiteHref("/", "elite", false, null, null, "/p/abc123")).toBe("/p/abc123");
    expect(resolveSiteHref("/services", "elite", false, null, null, "/draft/elite")).toBe("/draft/elite/services");
  });
  it("rewrites already-public /s/<slug> links too", () => {
    expect(resolveSiteHref("/s/elite/full", "elite", false, null, null, "/p/abc123")).toBe("/p/abc123/full");
  });
  it("keeps the public address when not in a preview", () => {
    expect(resolveSiteHref("/contact", "elite", false)).toBe("/s/elite/contact");
    expect(resolveSiteHref("/contact", "elite", true)).toBe("/contact");
  });
  it("ignores a malformed base and leaves outside links alone", () => {
    expect(resolveSiteHref("/contact", "elite", false, null, null, "//evil.com")).toBe("/s/elite/contact");
    expect(resolveSiteHref("tel:+19195550100", "elite", false, null, null, "/p/abc123")).toBe("tel:+19195550100");
  });
});

describe("every site can take a message", () => {
  it("offers the enquiry form as an AI widget", () => {
    expect(COMPOSITION_WIDGETS).toContain("enquiry_form");
  });
  it("adds the form to a contact page that only lists phone and email", () => {
    expect(needsEnquiryForm("contact", "contact", [{ id: "1", kind: "composition", settings: tree("contact_details") } as never])).toBe(true);
  });
  it("adds the form where a button points at #contact-form", () => {
    const section = { id: "1", kind: "composition", settings: { composition: { version: 1, label: "x", root: { type: "button", text: "Get a Quote", href: "/contact#contact-form" } } } };
    expect(needsEnquiryForm("home", "home", [section as never])).toBe(true);
  });
  it("leaves pages that already have a working form alone", () => {
    expect(needsEnquiryForm("contact", "contact", [{ id: "1", kind: "composition", settings: tree("enquiry_form") } as never])).toBe(false);
    expect(needsEnquiryForm("contact", "contact", [{ id: "1", kind: "composition", settings: tree("booking_form") } as never])).toBe(false);
    expect(needsEnquiryForm("about", "about", [])).toBe(false);
  });
  it("counts the message form as a way to enquire at launch", () => {
    const base = { primaryCtaLabel: "Get a quote", secondaryCtaLabel: null, phone: "919", email: null, quoteForms: 0, quoteQuestions: 0, bookableServices: 0, captureSections: 1, siteLeads: 0, loggedActivities: 0, confirmationAutomations: 0, notifiesOwner: true };
    expect(captureQa(base).checks.find((c) => c.key === "capture")?.ok).toBe(false);
    expect(captureQa({ ...base, enquiryForms: 1 }).checks.find((c) => c.key === "capture")?.ok).toBe(true);
  });
  it("finds a widget anywhere in a stored layout", () => {
    expect(settingsHaveWidget(tree("enquiry_form"), "enquiry_form")).toBe(true);
    expect(settingsHaveWidget(tree("contact_details"), "enquiry_form")).toBe(false);
  });
  it("the enquiry form keeps the spam honeypot and the preview simulation", () => {
    const src = readFileSync("src/components/site/SiteForms.tsx", "utf8");
    const form = src.slice(src.indexOf("export function EnquiryForm"));
    expect(form).toContain("<Honeypot />");
    expect(form).toContain("useLeadSubmit()");
    expect(form).toContain('kind: "inquiry"');
    expect(form).toContain('id="contact-form"');
  });
  it("contact sections must carry the enquiry form in first builds", () => {
    const src = readFileSync("src/lib/builder/first-build-compositions.server.ts", "utf8");
    expect(src).toContain('if (role === "contact") return "enquiry_form";');
  });
  it("publishing checks for a menu bar and footer", () => {
    const src = readFileSync("src/lib/production.functions.ts", "utf8");
    expect(src).toContain('key: "navigation"');
  });
});
