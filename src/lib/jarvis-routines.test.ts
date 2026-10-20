import { describe, expect, it } from "vitest";
import { parseRoutineInput, routineIsDue } from "./jarvis-routines.server";
import { parseMemoryContent, parseMemoryKind } from "./jarvis-memory.server";
import { parseRoutineDraft } from "./jarvis-actions";

describe("routine input validation", () => {
  it("accepts a complete daily routine", () => {
    expect(parseRoutineInput({ name: "Daily briefing", prompt: "Give me the daily briefing.", frequency: "daily", hour: 8, minute: 30 }))
      .toEqual({ name: "Daily briefing", prompt: "Give me the daily briefing.", frequency: "daily", hour: 8, minute: 30 });
  });

  it("defaults unknown frequency to daily and clamps times", () => {
    const parsed = parseRoutineInput({ name: "Weekly check", prompt: "Review the week ahead.", frequency: "hourly", hour: 99, minute: -5 });
    expect(parsed.frequency).toBe("daily");
    expect(parsed.hour).toBe(23);
    expect(parsed.minute).toBe(0);
  });

  it("rejects a missing name or prompt", () => {
    expect(() => parseRoutineInput({ name: "", prompt: "Do something useful." })).toThrow();
    expect(() => parseRoutineInput({ name: "Briefing", prompt: "short" })).toThrow();
  });

  it("parseRoutineDraft matches the server parser", () => {
    const draft = parseRoutineDraft({ name: "Daily briefing", prompt: "Give me the daily briefing.", frequency: "weekly", hour: 7, minute: 15 });
    expect(draft).toEqual(parseRoutineInput({ name: "Daily briefing", prompt: "Give me the daily briefing.", frequency: "weekly", hour: 7, minute: 15 }));
  });
});

describe("routine due calculation", () => {
  // 2026-10-19 was a Monday; 14:00 UTC = 10:00 Eastern.
  const monday10amUtc = new Date("2026-10-19T14:00:00Z");
  const tuesday10amUtc = new Date("2026-10-20T14:00:00Z");

  it("is due after its scheduled Eastern time when it has never run", () => {
    expect(routineIsDue({ frequency: "daily", hour: 8, minute: 0, last_run_at: null }, monday10amUtc)).toBe(true);
  });

  it("is not due before its scheduled time", () => {
    expect(routineIsDue({ frequency: "daily", hour: 12, minute: 0, last_run_at: null }, monday10amUtc)).toBe(false);
  });

  it("is not due twice on the same local day", () => {
    expect(routineIsDue({ frequency: "daily", hour: 8, minute: 0, last_run_at: "2026-10-19T13:00:00Z" }, monday10amUtc)).toBe(false);
  });

  it("is due again the next day", () => {
    expect(routineIsDue({ frequency: "daily", hour: 8, minute: 0, last_run_at: "2026-10-19T13:00:00Z" }, tuesday10amUtc)).toBe(true);
  });

  it("weekly routines only run on Mondays", () => {
    expect(routineIsDue({ frequency: "weekly", hour: 8, minute: 0, last_run_at: null }, monday10amUtc)).toBe(true);
    expect(routineIsDue({ frequency: "weekly", hour: 8, minute: 0, last_run_at: null }, tuesday10amUtc)).toBe(false);
  });

  it("a corrupt last_run_at does not block a due routine", () => {
    expect(routineIsDue({ frequency: "daily", hour: 8, minute: 0, last_run_at: "not-a-date" }, monday10amUtc)).toBe(true);
  });
});

describe("memory input validation", () => {
  it("trims and bounds content", () => {
    expect(parseMemoryContent("  remember this  ")).toBe("remember this");
    expect(parseMemoryContent(` ${"x".repeat(600)} `)).toHaveLength(500);
  });

  it("rejects empty or trivial content", () => {
    expect(() => parseMemoryContent("")).toThrow();
    expect(() => parseMemoryContent("ok")).toThrow();
    expect(() => parseMemoryContent(42)).toThrow();
  });

  it("defaults unknown kinds to note", () => {
    expect(parseMemoryKind("preference")).toBe("preference");
    expect(parseMemoryKind("secret")).toBe("note");
    expect(parseMemoryKind(undefined)).toBe("note");
  });
});
