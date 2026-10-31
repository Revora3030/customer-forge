import { describe, expect, it } from "vitest";
import type { GateFailure } from "@/lib/builder/quality/quality-gate";
import { buildScoreRow, changeRequestRow, gateAttemptRow, qualityScore, recordQualityEvent, sanitizeChangeRequest, summarizeByTrade, type QualityLogRow } from "@/lib/builder/quality/quality-log";

const f = (severity: "block" | "warn", code = "x", partId: string | null = "a"): GateFailure => ({ check: "lint", partId, severity, code, message: "m" });
const common = { organizationId: "00000000-0000-0000-0000-000000000001", tradeSlug: "Roofing Co!" };

describe("quality log", () => {
  it("scores 100 minus penalties", () => {
    expect(qualityScore([])).toBe(100);
    expect(qualityScore([f("block"), f("warn")])).toBe(70);
    expect(qualityScore(Array.from({ length: 9 }, () => f("block")))).toBe(0);
  });
  it("builds rows with a clean slug and compact failures", () => {
    const row = gateAttemptRow(common, { attempt: 1, failures: [f("block", "ai-phrasing")], regenerated: ["a"] });
    expect(row).toMatchObject({ trade_slug: "roofing-co", event_kind: "gate_attempt", attempt: 1, score: 75 });
    expect(row.failures[0]).toEqual({ check: "lint", code: "ai-phrasing", severity: "block", part: "a" });
    expect(buildScoreRow(common, [], true, 3)).toMatchObject({ event_kind: "build_score", score: 100, passed: true, attempt: 2 });
  });
  it("strips contact details from change requests and caps length", () => {
    const text = sanitizeChangeRequest("Email me at a@b.co or call 919 555 0100 " + "x".repeat(600));
    expect(text).not.toMatch(/@|919/);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(changeRequestRow(common, "make the hero bigger").change_request).toBe("make the hero bigger");
    expect(changeRequestRow(common, "   ").change_request).toBeNull();
  });
  it("summarizes per trade, worst first", () => {
    const rows: QualityLogRow[] = [
      { ...buildScoreRow({ ...common, tradeSlug: "plumbing" }, [f("block")], false, 3) },
      { ...buildScoreRow({ ...common, tradeSlug: "roofing" }, [], true, 1) },
      { ...gateAttemptRow({ ...common, tradeSlug: "plumbing" }, { attempt: 0, failures: [f("block", "emoji"), f("warn", "emoji")], regenerated: [] }) },
      { ...changeRequestRow({ ...common, tradeSlug: "plumbing" }, "change colours") },
    ];
    const s = summarizeByTrade(rows);
    expect(s.map((x) => x.trade)).toEqual(["plumbing", "roofing"]);
    expect(s[0]).toMatchObject({ avgScore: 75, passRate: 0, changeRequests: 1, topFailures: [{ code: "emoji", count: 2 }] });
  });
  it("never throws when the table is missing", async () => {
    const row = changeRequestRow(common, "x");
    expect(await recordQualityEvent({ from: () => ({ insert: async () => ({ error: { message: "relation does not exist", code: "42P01" } }) }) }, row)).toBe(false);
    expect(await recordQualityEvent({ from: () => ({ insert: () => { throw new Error("down"); } }) }, row)).toBe(false);
    expect(await recordQualityEvent({ from: () => ({ insert: async () => ({ error: null }) }) }, row)).toBe(true);
  });
});
