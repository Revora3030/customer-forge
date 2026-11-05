/**
 * Fixture: labelled JC-47 repeat-digest cases. Times are fixed UTC so day keys
 * stay "2026-11-05" regardless of the box timezone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  foldRepeatNotices,
  noticeCalendarDayKey,
  repeatDigestKey,
  repeatDigestLabel,
  repeatDigestMemberIds,
} from "./jarvis-notice-digest";
import { dismissNoticeIds, isNoticeDismissed, NOTICE_DISMISS_STORE, readDismissedNoticeIds } from "./jarvis-notice-dismiss";

const DAY = "2026-11-05";
const CI = (id: string, minute: string, subject = "Revora Quality Gate") => ({
  id,
  role: "assistant" as const,
  content: `Heads up [event:ci-failed-triage|${subject}]\n\nA CI check failed on the release branch: ${subject}. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “CI failed on ${subject}.”`,
  created_at: `${DAY}T12:${minute}:00.000Z`,
});
const SITE = (id: string, minute: string) => ({
  id,
  role: "assistant" as const,
  content: "Heads up [event:site-down|Site health]\n\nThe homepage returned 503. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “Site health check failed.”",
  created_at: `${DAY}T13:${minute}:00.000Z`,
});
const USER = (id: string) => ({
  id,
  role: "user" as const,
  content: "What happened?",
  created_at: `${DAY}T12:30:00.000Z`,
});
const OTHER_DAY = {
  id: "old",
  role: "assistant" as const,
  content: "Heads up [event:ci-failed-triage|Revora Quality Gate]\n\nYesterday's failure. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “CI failed.”",
  created_at: "2026-11-04T12:00:00.000Z",
};

describe("noticeCalendarDayKey / labels (JC-47 fixture)", () => {
  it("uses UTC YYYY-MM-DD", () => {
    expect(noticeCalendarDayKey(`${DAY}T23:59:00.000Z`)).toBe(DAY);
    expect(noticeCalendarDayKey("not-a-date")).toBe("");
  });

  it("builds digest keys and count labels", () => {
    expect(repeatDigestKey("ci-failed-triage", DAY)).toBe(`ci-failed-triage|${DAY}`);
    expect(repeatDigestLabel("Release check failed", 1)).toBe("Release check failed");
    expect(repeatDigestLabel("Release check failed", 3)).toBe("Release check failed · 3 today");
  });
});

describe("foldRepeatNotices (JC-47)", () => {
  it("leaves a single notice as an ordinary row", () => {
    const folded = foldRepeatNotices([CI("a", "00")]);
    expect(folded).toEqual([{ kind: "row", row: CI("a", "00") }]);
  });

  it("groups same ruleId same day into one digest at the last member", () => {
    const rows = [CI("a", "00"), USER("u1"), CI("b", "10", "Gate B"), CI("c", "20")];
    const folded = foldRepeatNotices(rows);
    expect(folded).toHaveLength(2);
    expect(folded[0]).toMatchObject({ kind: "row", row: { id: "u1" } });
    expect(folded[1]).toMatchObject({
      kind: "repeat-digest",
      ruleId: "ci-failed-triage",
      dayKey: DAY,
      key: `ci-failed-triage|${DAY}`,
    });
    const digest = folded[1]!;
    if (digest.kind !== "repeat-digest") throw new Error("expected digest");
    expect(digest.members.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(digest.members[0]!.notice.label).toBe("Release check failed");
  });

  it("keeps different rules and different days separate", () => {
    const folded = foldRepeatNotices([OTHER_DAY, CI("a", "00"), SITE("s1", "00"), SITE("s2", "05")]);
    expect(folded.map((item) => (item.kind === "row" ? item.row.id : item.key))).toEqual([
      "old",
      "a",
      `site-down|${DAY}`,
    ]);
  });

  it("exposes every member id for dismiss-all", () => {
    const folded = foldRepeatNotices([CI("a", "00"), CI("b", "01")]);
    const digest = folded[0]!;
    expect(digest.kind).toBe("repeat-digest");
    if (digest.kind !== "repeat-digest") return;
    expect(repeatDigestMemberIds(digest.members)).toEqual(["a", "b"]);
  });
});

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

describe("dismissNoticeIds (JC-47 localStorage only)", () => {
  beforeEach(() => {
    const store = new MemoryStorage();
    vi.stubGlobal("localStorage", store);
    vi.stubGlobal("window", { localStorage: store });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes every member id into the existing dismiss store", () => {
    localStorage.removeItem(NOTICE_DISMISS_STORE);
    dismissNoticeIds(["a", "b", "a"]);
    expect(readDismissedNoticeIds()).toEqual(["a", "b"]);
    expect(isNoticeDismissed("a")).toBe(true);
    expect(isNoticeDismissed("c")).toBe(false);
    dismissNoticeIds(["c"]);
    expect(readDismissedNoticeIds()).toEqual(["a", "b", "c"]);
  });
});
