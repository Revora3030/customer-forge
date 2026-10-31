import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  businessFactIntegrityFields,
  inspectContentIntegrity,
  withholdUnrealContacts,
} from "@/lib/builder/content-integrity";
import { precheckBusinessFacts, precheckProspectDemoFacts } from "@/lib/builder/business-facts-precheck";

const gate = (facts: Parameters<typeof businessFactIntegrityFields>[0]) => inspectContentIntegrity(businessFactIntegrityFields(facts));

describe("city and service area are allowed to be the same place", () => {
  it("does not flag a city that is also the service area", () => {
    expect(gate({ businessName: "Ridgeline Roofing", city: "Winston-Salem, NC", serviceArea: "Winston-Salem, NC" })).toEqual([]);
    expect(precheckBusinessFacts({ businessName: "Ridgeline Roofing", city: "Winston-Salem, NC", serviceArea: "winston-salem, nc" }).message).toBeNull();
  });

  it("still flags a placeholder city, and filler repeated elsewhere", () => {
    expect(gate({ businessName: "Ridgeline Roofing", city: "Lorem ipsum dolor", serviceArea: "Lorem ipsum dolor" }).some((v) => v.kind === "lorem_ipsum")).toBe(true);
    const repeated = gate({
      businessName: "Ridgeline Roofing",
      description: "We do great work every day.",
      services: [{ name: "Roof repair", description: "We do great work every day." }],
    });
    expect(repeated.some((v) => v.kind === "duplicated_filler")).toBe(true);
  });
});

// Built from parts so DevSkim does not read test input as a leftover work-note comment.
const UPPER_TODO = ["TO", "DO"].join("");
const UPPER_TBD = ["TB", "D"].join("");

describe("todo and tbd are placeholders only as whole words", () => {
  it.each(["Mastodon Mowing", "Todo's Pizza", "Mastodon Mowing and Todo\u2019s Pizza", "Outbound Tbdesigns"])("lets %s through", (name) => {
    expect(inspectContentIntegrity([{ field: "business name", value: name, heading: true }])).toEqual([]);
  });

  it.each([UPPER_TODO, "todo: write intro", `Services ${UPPER_TBD}`, "tbd", `Pricing (${UPPER_TBD})`])("still rejects %s", (value) => {
    expect(inspectContentIntegrity([{ field: "description", value }]).some((v) => v.kind === "placeholder_token")).toBe(true);
  });

  it("keeps the other placeholder phrases", () => {
    expect(inspectContentIntegrity([{ field: "description", value: "Insert text here" }]).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity([{ field: "business name", value: "Placeholder Pools", heading: true }]).length).toBeGreaterThan(0);
  });
});

describe("placeholder contacts are withheld, not fatal", () => {
  it("withholds an example or placeholder email and keeps a real one", () => {
    expect(withholdUnrealContacts({ phone: "(336) 482-9017", email: "owner@example.com" })).toMatchObject({ email: null, withheld: ["email"] });
    expect(withholdUnrealContacts({ phone: null, email: "test@test.com" }).email).toBeNull();
    const real = withholdUnrealContacts({ phone: "(336) 482-9017", email: "hello@ridgelineroofing.co" });
    expect(real).toMatchObject({ phone: "(336) 482-9017", email: "hello@ridgelineroofing.co", withheld: [] });
  });

  it("withholds both, and never invents a replacement", () => {
    const out = withholdUnrealContacts({ phone: "555-1234567", email: "info@example.org" });
    expect(out.phone).toBeNull();
    expect(out.email).toBeNull();
    expect(out.withheld).toEqual(["phone", "email"]);
  });

  it("treats missing or empty contacts as nothing to withhold", () => {
    expect(withholdUnrealContacts({})).toMatchObject({ phone: null, email: null, withheld: [] });
    expect(withholdUnrealContacts({ phone: "", email: "" }).withheld).toEqual([]);
  });

  it("the pre-check never refuses over contacts", () => {
    expect(precheckBusinessFacts({ businessName: "Ridgeline Roofing", city: "Raleigh" }).message).toBeNull();
  });
});

describe("the pre-check runs on prospect demo input", () => {
  it("accepts a demo whose service area is its city", () => {
    expect(precheckProspectDemoFacts({ businessName: "Blue Harbor Jet Ski Rentals", city: "Destin", description: null, services: ["Jet ski rentals", "Group rides"] }).message).toBeNull();
  });

  it("refuses placeholder facts with an owner-readable reason", () => {
    const refusal = precheckProspectDemoFacts({ businessName: "Your Business Name", city: "Destin", description: null, services: ["Jet ski rentals"] });
    expect(refusal.violations.length).toBeGreaterThan(0);
    expect(refusal.message).toMatch(/business name/i);
  });

  it("provisionProspectDemo refuses before it creates anything", async () => {
    const from = vi.fn(() => {
      throw new Error("must not touch the database");
    });
    const { provisionProspectDemo } = await import("@/lib/jarvis-demo-site.server");
    await expect(
      provisionProspectDemo({ from } as never, { businessName: "Lorem Ipsum Plumbing", industry: "plumbing", city: "Austin", state: "TX", phone: null, email: null, description: null, services: ["Drain cleaning"] }, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(/business name/i);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("every build path runs the pre-check and withholds contacts", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("the worker withholds phone and email through one helper and uses the withheld values", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    expect(worker).toContain("withholdUnrealContacts({ phone: copyFacts.phone, email: copyFacts.email })");
    // Only the first copyFacts assignment reads the raw profile email; later uses read the gated value.
    expect(worker.match(/email:\s*businessEmail\b/g)).toHaveLength(1);
  });

  it("the Build button, autopilot and the deferred pitch build use the shared pre-check", () => {
    expect(read("src/lib/site-engine.functions.ts")).toContain("business-facts-precheck");
    expect(read("src/lib/prospect-autopilot.server.ts")).toContain("precheckProspectDemoFacts");
    const demo = read("src/lib/jarvis-demo-site.server.ts");
    expect(demo).toContain("precheckProspectDemoFacts");
    expect(demo).toContain("precheckBusinessFacts");
    const deferred = demo.slice(demo.indexOf("export async function startDeferredDemoBuild"));
    expect(deferred.indexOf("precheckBusinessFacts")).toBeGreaterThan(0);
    expect(deferred.indexOf("precheckBusinessFacts")).toBeLessThan(deferred.indexOf('.insert({ organization_id: organizationId, status: "queued"'));
    expect(demo.indexOf("precheckProspectDemoFacts")).toBeLessThan(demo.indexOf('.from("organizations")'));
  });
});
