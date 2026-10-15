import { describe, expect, it } from "vitest";
import {
  candidateForUi,
  compositionSafetyIssues,
  readAcquisitionConcept,
  scoreAcquisitionOpportunity,
} from "./jarvis-acquisition-studio";

const validConcept = () => ({
  title: "Northside Exterior Care — Website Concept",
  description: "An original homepage direction prepared for business-owner review.",
  designNotes: "Editorial typography, warm neutral backgrounds, bold ink tones, and a high-contrast estimate path.",
  proposedServices: ["House wash", "Driveway cleaning"],
  factsToConfirm: ["Confirm the exact service list.", "Confirm service areas.", "Confirm the preferred contact method."],
  tree: {
    version: 1,
    label: "Northside exterior care concept",
    root: {
      type: "stack",
      style: { gap: 24, padding: 48, background: "#101820", color: "#FFFFFF" },
      children: [
        { type: "text", text: "EXTERIOR CARE · CONCEPT", style: { color: "#E8B566", size: 14, uppercase: true, weight: 700 } },
        { type: "heading", level: 1, text: "A cleaner first impression starts here.", style: { color: "#FFFFFF", size: 56, weight: 800, lineHeight: 1.02 } },
        { type: "text", text: "A proposed web direction for a local service business. Confirm the exact services and details before launch.", style: { color: "#D6DDE3", size: 18, lineHeight: 1.5 } },
        { type: "button", text: "Discuss a quote", href: "#contact", style: { background: "#E8B566", color: "#101820", paddingX: 24, paddingY: 16, radius: 8 } },
      ],
    },
  },
});

describe("Jarvis acquisition studio scoring", () => {
  it("prioritizes listings without a website field without calling them confirmed website-free businesses", () => {
    const absent = scoreAcquisitionOpportunity({
      websiteListed: false, hasPhone: true, hasCategory: true, hasCity: true, reviewCount: 12,
    });
    const present = scoreAcquisitionOpportunity({
      websiteListed: true, hasPhone: true, hasCategory: true, hasCity: true, reviewCount: 12,
    });
    expect(absent.score).toBe(80);
    expect(present.score).toBe(45);
    expect(absent.reasons[0]).toContain("does not prove");
    expect(present.reasons[0]).toContain("redesign");
  });

  it("normalizes a Places candidate and leaves missing facts null", () => {
    const candidate = candidateForUi({
      placeId: "ChIJ5-example", name: "  Business   Name ", category: "pressure washing", city: "Carrboro, NC",
    });
    expect(candidate.name).toBe("Business Name");
    expect(candidate.website).toBeNull();
    expect(candidate.phone).toBeNull();
    expect(candidate.websiteStatus).toBe("website_not_listed");
    expect(candidate.scoreReasons[0]).toContain("does not prove");
  });

  it("requires a current stable place ID to persist a listing", () => {
    expect(() => candidateForUi({ name: "No stable ID" })).toThrow(/place ID/);
  });
});

describe("Jarvis acquisition concept validation", () => {
  it("accepts a valid structured concept and real composition tree", () => {
    const result = readAcquisitionConcept(validConcept());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.concept.tree.version).toBe(1);
      expect(result.concept.factsToConfirm.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("blocks credentials and fabricated social proof", () => {
    const raw = validConcept();
    raw.tree.root.children[1].text = "Licensed, insured and award-winning professionals.";
    const result = readAcquisitionConcept(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/claim|credential|review|evidence/i);
  });

  it("blocks links outside the concept's in-page navigation", () => {
    const raw = validConcept();
    raw.tree.root.children[3].href = "https://example.com/contact";
    const result = readAcquisitionConcept(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/in-page links/i);
  });

  it("blocks arbitrary image hosts and insecure photo URLs", () => {
    const result = compositionSafetyIssues({
      version: 1,
      root: { type: "media", src: "http:" + "//evil.invalid/photo.jpg", alt: "A service vehicle" },
    });
    expect(result.join(" ")).toMatch(/HTTPS sources/);
  });

  it("rejects concepts with no fact-confirmation list", () => {
    const raw = validConcept();
    raw.factsToConfirm = [];
    expect(readAcquisitionConcept(raw).ok).toBe(false);
  });

  it("rejects an invalid composition instead of generating a fallback template", () => {
    const raw = validConcept();
    raw.tree.root.children[0].type = "arbitrary-html";
    expect(readAcquisitionConcept(raw).ok).toBe(false);
  });
});
