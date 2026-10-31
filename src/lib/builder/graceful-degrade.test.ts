import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { degradeLayoutPolish, degradePictures, mergeFollowUps } from "./graceful-degrade";

const shots = [
  { slot: "hero", label: "Hero", purpose: "opening scene", subjectHint: "the workshop" },
  { slot: "services:card-1", label: "Services", purpose: "supporting" },
  { slot: "hero", label: "Duplicate", purpose: "dup" },
  { slot: "!!", label: "Bad slot", purpose: "x" },
];

describe("degradePictures", () => {
  it("does nothing when pictures exist", () => {
    expect(degradePictures({ ownerPhotoCount: 0, generatedStatus: "generated", keptPictures: 3, shots })).toBeNull();
    expect(degradePictures({ ownerPhotoCount: 4, generatedStatus: "blocked", keptPictures: 0, shots })).toBeNull();
    expect(degradePictures({ ownerPhotoCount: 0, generatedStatus: "owner_photos", keptPictures: 0, shots })).toBeNull();
  });

  it("degrades a zero-picture build into failed, retryable records from the AI's own shot list", () => {
    const out = degradePictures({ ownerPhotoCount: 0, generatedStatus: "blocked", keptPictures: 0, message: "model busy", shots, now: new Date("2026-10-31T00:00:00Z") });
    expect(out).not.toBeNull();
    expect(out!.followUp).toMatchObject({ kind: "pictures", status: "pending", reason: "model busy", slots: ["hero", "services:card-1"] });
    expect(out!.records.map((r) => r.slot)).toEqual(["hero", "services:card-1"]);
    expect(out!.records[0]).toMatchObject({ status: "failed", source: "generated", rejection_reason: "model busy" });
    expect(out!.records[0]!.direction).toBe("Hero — opening scene — the workshop");
    expect(out!.attention).toMatch(/without pictures/);
  });

  it("invents no pictures or slots when the shot list is empty", () => {
    const out = degradePictures({ ownerPhotoCount: 0, generatedStatus: "blocked", keptPictures: 0, shots: [] });
    expect(out!.records).toEqual([]);
    expect(out!.followUp.slots).toEqual([]);
  });
});

describe("degradeLayoutPolish", () => {
  it("returns null when nothing was skipped", () => {
    expect(degradeLayoutPolish({ optionalSkipped: 0, optionalFailed: 0 })).toBeNull();
  });
  it("records skipped and broken optional rounds and keeps the AI layout promise", () => {
    const out = degradeLayoutPolish({ optionalSkipped: 2, optionalFailed: 1 });
    expect(out!.followUp.kind).toBe("layout_polish");
    expect(out!.followUp.reason).toMatch(/2 pages skipped/);
    expect(out!.followUp.reason).toMatch(/1 polish round could not run/);
    expect(out!.followUp.reason).toMatch(/AI-designed layout/);
  });
});

describe("mergeFollowUps", () => {
  it("keeps one pending entry per kind", () => {
    const a = degradeLayoutPolish({ optionalSkipped: 1, optionalFailed: 0 })!.followUp;
    const b = degradeLayoutPolish({ optionalSkipped: 3, optionalFailed: 0 })!.followUp;
    const merged = mergeFollowUps([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.reason).toMatch(/3 pages/);
    expect(mergeFollowUps(undefined, [a])).toHaveLength(1);
  });
});

describe("worker wiring", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
  const compositions = readFileSync("src/lib/builder/first-build-compositions.server.ts", "utf8");
  it("no longer throws when the build has no pictures", () => {
    expect(worker).not.toMatch(/AiStepUnavailableError\("pictures"/);
    expect(worker).toContain("degradePictures(");
  });
  it("still stops the build for a REQUIRED layout that could not be designed", () => {
    expect(worker).toMatch(/AiStepUnavailableError\(\s*"section layouts"/);
  });
  it("records follow-ups in the report and attention list", () => {
    expect(worker).toContain("followUps: degradedSteps");
    expect(worker).toContain("...degradedAttention");
  });
  it("optional polish rounds are guarded", () => {
    expect(compositions).toContain("result.optionalFailed");
    expect(compositions).toMatch(/try \{\s*await repairDesignQuality/);
  });
  it("does not touch the spend cap", () => {
    expect(readFileSync("src/lib/builder/build-spend.ts", "utf8")).toContain("BUILD_SPEND_CAP_USD");
  });
});
