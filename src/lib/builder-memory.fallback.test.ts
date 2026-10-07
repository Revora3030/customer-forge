import { describe, expect, it } from "vitest";
import { isMissingColumnError, mergeTurns, type SavedTurn } from "./builder-memory";

const turn = (role: SavedTurn["role"], content: string, at: string): SavedTurn => ({ role, content, at, branch: "main" });

describe("builder memory resilience", () => {
  it("recognises missing-column errors from Postgres and PostgREST", () => {
    expect(isMissingColumnError({ code: "42703", message: 'column "request_id" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'branch' column" })).toBe(true);
    expect(isMissingColumnError({ message: 'column builder_messages.kind does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it("keeps unsaved session turns newer than the database copy, without duplicates", () => {
    const saved = [turn("user", "make it blue", "2026-10-07T00:00:00.000Z"), turn("assistant", "Done.", "2026-10-07T00:00:01.000Z")];
    const cached = [...saved, turn("user", "add a FAQ", "2026-10-07T00:00:05.000Z")];
    expect(mergeTurns(saved, cached).map((t) => t.content)).toEqual(["make it blue", "Done.", "add a FAQ"]);
    expect(mergeTurns([], cached)).toHaveLength(3);
    expect(mergeTurns(saved, [])).toBe(saved);
  });
});
