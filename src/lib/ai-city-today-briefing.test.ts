import { describe, expect, it } from "vitest";
import type { CitySnapshot, CityWork } from "./ai-city";
import {
  RUNNING_STALL_MS,
  WAITING_STALL_MS,
  buildTodayBriefing,
  ciFailureRows,
  stalledBuilds,
} from "./ai-city-today-briefing";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function row(partial: Partial<CityWork> & Pick<CityWork, "id" | "title" | "district" | "status" | "source">): CityWork {
  return { at: at(60_000), ...partial };
}

function snap(sources: CitySnapshot["sources"]): CitySnapshot {
  return { checkedAt: "2026-11-05T12:00:00Z", sources };
}

describe("buildTodayBriefing", () => {
  it("reports unavailable when the snapshot is missing", () => {
    expect(buildTodayBriefing(undefined, NOW)).toEqual({ available: false, items: [], checkedAt: null });
  });

  it("returns an empty calm list when nothing needs the owner", () => {
    const briefing = buildTodayBriefing(
      snap({
        jobs: { available: true, total: 1, truncated: false, rows: [row({ id: "j1", title: "Build", district: "factory", status: "running", source: "generation_jobs", at: at(60_000) })] },
        approvals: { available: true, total: 0, truncated: false, rows: [] },
        errors: { available: true, total: 0, truncated: false, rows: [] },
      }),
      NOW,
    );
    expect(briefing.available).toBe(true);
    expect(briefing.items).toEqual([]);
  });

  it("ranks approvals ahead of failures, CI and stalled builds and caps at three", () => {
    const briefing = buildTodayBriefing(
      snap({
        approvals: {
          available: true,
          total: 4,
          truncated: false,
          rows: [
            row({ id: "a1", title: "Pitch to Acme", district: "growth", status: "pending", source: "approval_queue" }),
            row({ id: "a2", title: "Demo launch", district: "growth", status: "pending", source: "approval_queue" }),
          ],
        },
        jobs: {
          available: true,
          total: 2,
          truncated: false,
          rows: [
            row({ id: "j1", title: "Homepage", district: "factory", status: "running", source: "generation_jobs", at: at(RUNNING_STALL_MS + 5_000) }),
            row({ id: "j2", title: "Layout", district: "factory", status: "failed", source: "generation_jobs", at: at(3_600_000), detail: "timeout" }),
          ],
        },
        errors: {
          available: true,
          total: 1,
          truncated: false,
          rows: [row({ id: "e1", title: "Revora Quality Gate failed", district: "security", status: "error", source: "error_events", at: at(120_000) })],
        },
        traces: {
          available: true,
          total: 2,
          truncated: false,
          rows: [
            row({ id: "t1", title: "layout", district: "institute", status: "failed", source: "ai_team_trace", at: at(60_000), detail: "402 insufficient credits" }),
            row({ id: "t2", title: "copy", district: "institute", status: "failed", source: "ai_team_trace", at: at(90_000), detail: "402 payment required" }),
          ],
        },
      }),
      NOW,
    );
    expect(briefing.items).toHaveLength(3);
    expect(briefing.items.map((item) => item.kind)).toEqual(["approvals", "failures", "ci"]);
    expect(briefing.items[0]?.title).toContain("4 approvals");
    expect(briefing.items[0]?.draft).toContain("[AI City · Today]");
    expect(briefing.items[0]?.draft).toContain("do not spend, send or publish without my explicit approval");
    expect(briefing.items[1]?.kind).toBe("failures");
    expect(briefing.items[1]?.draft).toContain("[AI City · Today]");
    expect(briefing.items[2]?.kind).toBe("ci");
  });

  it("never invents a zero when the approvals feed is unreadable", () => {
    const briefing = buildTodayBriefing(
      snap({
        approvals: { available: false, total: null, truncated: false, rows: [] },
        jobs: {
          available: true,
          total: 1,
          truncated: false,
          rows: [row({ id: "j1", title: "Homepage", district: "factory", status: "running", source: "generation_jobs", at: at(RUNNING_STALL_MS + 1_000) })],
        },
      }),
      NOW,
    );
    expect(briefing.items.map((item) => item.kind)).toEqual(["stalled"]);
    expect(briefing.items.some((item) => item.kind === "approvals")).toBe(false);
  });

  it("one-tap drafts stay read-only triage prompts", () => {
    const briefing = buildTodayBriefing(
      snap({
        approvals: {
          available: true,
          total: 1,
          truncated: false,
          rows: [row({ id: "a1", title: "Pitch", district: "growth", status: "pending", source: "approval_queue" })],
        },
      }),
      NOW,
    );
    for (const item of briefing.items) {
      expect(item.draft).toMatch(/^\[AI City · Today]/);
      expect(item.draft).toContain(GATE_SNIPPET);
    }
  });
});

const GATE_SNIPPET = "do not spend, send or publish without my explicit approval";

describe("stalledBuilds and ciFailureRows", () => {
  it("flags running jobs past the heartbeat window and waiting past the longer window", () => {
    const rows = [
      row({ id: "fresh", title: "fresh", district: "factory", status: "running", source: "generation_jobs", at: at(60_000) }),
      row({ id: "stale", title: "stale", district: "factory", status: "running", source: "generation_jobs", at: at(RUNNING_STALL_MS + 1) }),
      row({ id: "wait", title: "wait", district: "factory", status: "waiting", source: "generation_jobs", at: at(WAITING_STALL_MS + 1) }),
      row({ id: "wait-fresh", title: "wait-fresh", district: "factory", status: "waiting", source: "generation_jobs", at: at(60_000) }),
    ];
    expect(stalledBuilds(rows, NOW).map((r) => r.id)).toEqual(["stale", "wait"]);
  });

  it("only keeps failed CI-looking rows inside the attention window", () => {
    const rows = [
      row({ id: "ci", title: "Revora Quality Gate failed", district: "security", status: "error", source: "error_events", at: at(60_000) }),
      row({ id: "other", title: "Database timeout", district: "security", status: "error", source: "error_events", at: at(60_000) }),
      row({ id: "old", title: "CI check suite", district: "security", status: "error", source: "error_events", at: at(ATTENTION_OLD) }),
    ];
    expect(ciFailureRows(rows, NOW).map((r) => r.id)).toEqual(["ci"]);
  });
});

const ATTENTION_OLD = 3 * 24 * 60 * 60_000;
