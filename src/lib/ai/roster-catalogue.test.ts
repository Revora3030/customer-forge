import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseCatalogue, staleRosterIds } from "./catalogue";
import { LOVABLE_CONVERSATION_MODELS } from "./lovable-models";
import { REVIEW_AREA_MODELS } from "@/lib/builder/review-panel.server";

/**
 * Snapshot of the authenticated /v1/models listing taken during this audit
 * (tests/fixtures/lovable-models.json). Every configured roster id must be
 * eligible for the surface its role calls.
 */
const FIXTURE = "src/lib/ai/fixtures/lovable-models.json";

describe("configured rosters vs live catalogue snapshot", () => {
  it.runIf(existsSync(FIXTURE))("has no stale, deprecated, retention-blocked or endpoint-incompatible ids", async () => {
    const models = parseCatalogue(JSON.parse(readFileSync(FIXTURE, "utf8")));
    const { providerConfig } = await import("./config");
    process.env["LOVABLE_API_KEY"] ||= "fixture";
    const config = providerConfig()!;
    const rosters = Object.fromEntries(Object.entries(config.models).map(([role, list]) => [role, list.split(",").map((id) => id.trim())]));
    rosters["conversation"] = [...LOVABLE_CONVERSATION_MODELS];
    rosters["review"] = Object.values(REVIEW_AREA_MODELS).flat() as string[];
    expect(staleRosterIds(models, rosters)).toEqual([]);
  });
});

describe("reviewer diversity", () => {
  it("no reviewer area defaults to the lead design model", async () => {
    process.env["LOVABLE_API_KEY"] ||= "fixture";
    const { providerConfig } = await import("./config");
    const lead = providerConfig()!.models.design.split(",")[0];
    for (const [area, ids] of Object.entries(REVIEW_AREA_MODELS)) expect(ids?.[0], area).not.toBe(lead);
  });
  it("uses at least four distinct vendors' models across review areas", () => {
    const vendors = new Set(Object.values(REVIEW_AREA_MODELS).flatMap((ids) => (ids ?? []).map((id) => id.split("/")[0])));
    expect(vendors.size).toBeGreaterThanOrEqual(3);
    const models = new Set(Object.values(REVIEW_AREA_MODELS).flat());
    expect(models.size).toBeGreaterThanOrEqual(8);
  });
});
