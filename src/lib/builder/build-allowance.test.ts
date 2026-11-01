import { describe, expect, it } from "vitest";
import { buildAllowance, buildAllowanceText, BUILD_WINDOW_MS, DAILY_BUILD_LIMIT } from "./build-allowance";

const NOW = Date.parse("2026-11-01T15:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const fmt = (d: Date) => d.toISOString();

describe("buildAllowance (mirrors enforce_daily_build_limit)", () => {
  it("counts only builds inside the rolling 24 hours", () => {
    expect(buildAllowance([ago(1), ago(23.9), ago(24.1), ago(48)], NOW)).toMatchObject({ used: 2, left: 3, nextFreeAt: null });
  });
  it("ignores missing or bad timestamps", () => {
    expect(buildAllowance([null, undefined, "not a date"], NOW)).toMatchObject({ used: 0, left: DAILY_BUILD_LIMIT });
  });
  it("names when the next build frees up once all are used", () => {
    const rows = [ago(20), ago(10), ago(5), ago(3), ago(1)];
    const a = buildAllowance(rows, NOW);
    expect(a).toMatchObject({ used: 5, left: 0 });
    expect(a.nextFreeAt?.getTime()).toBe(Date.parse(ago(20)) + BUILD_WINDOW_MS);
    expect(buildAllowanceText(a, fmt)).toContain("All 5 builds");
    expect(buildAllowanceText(a, fmt)).toContain(new Date(Date.parse(ago(20)) + BUILD_WINDOW_MS).toISOString());
  });
  it("uses the oldest of the newest five when more than five exist", () => {
    const rows = [ago(22), ago(20), ago(10), ago(5), ago(3), ago(1)];
    expect(buildAllowance(rows, NOW).nextFreeAt?.getTime()).toBe(Date.parse(ago(20)) + BUILD_WINDOW_MS);
  });
  it("says how many are left", () => {
    expect(buildAllowanceText(buildAllowance([ago(2)], NOW), fmt)).toBe("4 of 5 builds left in the last 24 hours. Chat edits don't count.");
  });
});
