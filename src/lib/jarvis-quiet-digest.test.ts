import { describe, expect, it } from "vitest";
import { foldQuietNotices, quietDigestLabel } from "./jarvis-quiet-digest";

type Row = { id: string; role: "user" | "assistant"; content: string; created_at: string };

const quiet = (id: string, subject = "Dependabot updates") =>
  ({
    id,
    role: "assistant" as const,
    created_at: "2026-11-05T06:00:00Z",
    content: `Heads up [event:dependabot-failed-quiet|${subject}]\n\nDependabot's dependency-update job failed: see Actions. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “Check Dependabot.”`,
  }) satisfies Row;

const loud = (id: string) =>
  ({
    id,
    role: "assistant" as const,
    created_at: "2026-11-05T06:01:00Z",
    content: `Heads up [event:ci-failed-triage|Revora Quality Gate]\n\nA CI check failed. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “Triage CI.”`,
  }) satisfies Row;

describe("foldQuietNotices (JC-46)", () => {
  it("leaves a single quiet notice as a normal row", () => {
    const folded = foldQuietNotices([quiet("a")]);
    expect(folded).toEqual([{ kind: "row", row: expect.objectContaining({ id: "a" }) }]);
  });

  it("collapses adjacent quiet notices into one digest", () => {
    const folded = foldQuietNotices([quiet("a"), quiet("b", "Dependabot B"), quiet("c")]);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({ kind: "quiet-digest" });
    if (folded[0]?.kind === "quiet-digest") {
      expect(folded[0].rows).toHaveLength(3);
      expect(folded[0].rows.every((row) => row.notice.quiet)).toBe(true);
    }
  });

  it("does not fold loud notices or break across a user message", () => {
    const user: Row = { id: "u", role: "user", content: "hi", created_at: "2026-11-05T06:00:30Z" };
    const folded = foldQuietNotices([quiet("a"), loud("b"), quiet("c"), quiet("d"), user, quiet("e"), quiet("f")]);
    expect(folded.map((item) => item.kind)).toEqual(["row", "row", "quiet-digest", "row", "quiet-digest"]);
    const digest = folded[2];
    expect(digest?.kind === "quiet-digest" && digest.rows.map((r) => r.id)).toEqual(["c", "d"]);
  });

  it("labels the digest with a count", () => {
    expect(quietDigestLabel(0)).toBe("0 quiet notices");
    expect(quietDigestLabel(1)).toBe("1 quiet notice");
    expect(quietDigestLabel(3)).toBe("3 quiet notices");
  });
});
