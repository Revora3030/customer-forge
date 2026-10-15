import { describe, expect, it } from "vitest";
import {
  appendReplyMeta,
  applyEdits,
  parsePullRequestProposal,
  extractActionBlock,
  MAX_ACTIONS_PER_STEP,
  parseActions,
  speakableText,
  splitReplyMeta,
} from "./jarvis-actions";

const TOOLS = ["platform.errors.summary", "builder.health.summary"];

describe("extractActionBlock", () => {
  it("separates the answer from requested actions", () => {
    const { text, requested } = extractActionBlock('Checking.\n<actions>[{"id":"demos.list","args":{}}]</actions>');
    expect(text).toBe("Checking.");
    expect(requested).toEqual([{ id: "demos.list", args: {} }]);
  });

  it("treats malformed JSON as a rejected action, not a crash", () => {
    const { requested } = extractActionBlock("<actions>[not json</actions>");
    expect(parseActions(requested, TOOLS).rejected[0]).toMatch(/unknown action/);
  });
});

describe("parseActions", () => {
  it("only runs registered diagnostic tools", () => {
    const parsed = parseActions(
      [
        { id: "diagnostic.run", args: { toolId: "platform.errors.summary" } },
        { id: "diagnostic.run", args: { toolId: "drop.tables" } },
      ],
      TOOLS,
    );
    expect(parsed.reads).toEqual([{ id: "diagnostic.run", toolId: "platform.errors.summary" }]);
    expect(parsed.rejected[0]).toMatch(/unknown toolId/);
  });

  it("bounds code reads", () => {
    const parsed = parseActions(
      [{ id: "code.read", args: { paths: ["src/a.ts", "src/b.ts", "src/c.ts", "bad path;rm"], line: -5 } }],
      TOOLS,
    );
    expect(parsed.reads).toEqual([{ id: "code.read", paths: ["src/a.ts", "src/b.ts"], line: 1 }]);
  });

  it("never runs writes: demo builds become validated proposals", () => {
    const parsed = parseActions(
      [
        { id: "demo.build", args: { businessName: "Triangle Comfort", industry: "HVAC", city: "Raleigh", services: ["AC repair"] } },
        { id: "demo.build", args: { businessName: "X" } },
      ],
      TOOLS,
    );
    expect(parsed.reads).toEqual([]);
    expect(parsed.proposals).toHaveLength(1);
    const first = parsed.proposals[0];
    expect(first?.id === "demo.build" ? first.input.businessName : null).toBe("Triangle Comfort");
    expect(parsed.rejected[0]).toMatch(/demo.build/);
  });

  it("rejects unknown actions and caps each step", () => {
    const many = Array.from({ length: MAX_ACTIONS_PER_STEP + 2 }, () => ({ id: "demos.list" }));
    const parsed = parseActions([{ id: "sql.execute" }, ...many], TOOLS);
    expect(parsed.rejected[0]).toMatch(/unknown action "sql.execute"/);
    expect(parsed.reads.length).toBeLessThanOrEqual(MAX_ACTIONS_PER_STEP);
  });
});

describe("reply metadata", () => {
  it("round-trips actions and proposals and stays out of speech", () => {
    const proposal = {
      id: "demo.build" as const,
      input: { businessName: "Triangle Comfort", industry: "HVAC", city: "Raleigh", state: null, phone: null, email: null, description: null, services: ["AC repair"] },
    };
    const stored = appendReplyMeta("Done.", { ran: ["Listed demo sites"], proposals: [proposal] });
    const { body, meta } = splitReplyMeta(stored);
    expect(body).toBe("Done.");
    expect(meta.ran).toEqual(["Listed demo sites"]);
    const restored = meta.proposals[0];
    expect(restored?.id === "demo.build" ? restored.input.businessName : null).toBe("Triangle Comfort");
    expect(speakableText(stored)).toBe("Done.");
  });

  it("leaves plain replies untouched", () => {
    expect(appendReplyMeta("Hi", { ran: [], proposals: [] })).toBe("Hi");
    expect(splitReplyMeta("Hi").meta).toEqual({ ran: [], proposals: [] });
  });
});

describe("pull request proposals", () => {
  const valid = {
    title: "Fix stalled build retry",
    summary: "Retries the worker kick once when the first attempt fails, so builds don't wait for the scheduler.",
    changes: [{ path: "src/lib/site-engine.functions.ts", edits: [{ find: "if (response.ok) return;", replace: "if (response.ok) return; // retried" }] }],
  };

  it("accepts focused edits to source files", () => {
    const pr = parsePullRequestProposal(valid);
    expect(pr.changes[0]?.path).toBe("src/lib/site-engine.functions.ts");
  });

  it("refuses CI workflows, generated files, secrets and traversal", () => {
    for (const path of [".github/workflows/ci.yml", "src/routeTree.gen.ts", ".env", "src/../.env", "package.json"]) {
      expect(() => parsePullRequestProposal({ ...valid, changes: [{ path, content: "x" }] })).toThrow(/can't change/);
    }
  });

  it("requires a title, a summary and real edits", () => {
    expect(() => parsePullRequestProposal({ ...valid, title: "fix" })).toThrow(/title/);
    expect(() => parsePullRequestProposal({ ...valid, summary: "" })).toThrow(/summary/);
    expect(() => parsePullRequestProposal({ ...valid, changes: [] })).toThrow(/no file changes/);
    expect(() => parsePullRequestProposal({ ...valid, changes: [{ path: "src/a.ts", edits: [{ find: "x", replace: "y" }] }] })).toThrow(/enough text/);
  });

  it("is reachable through parseActions as a proposal, never a read", () => {
    const parsed = parseActions([{ id: "code.pr", args: valid }], TOOLS);
    expect(parsed.reads).toEqual([]);
    expect(parsed.proposals[0]?.id).toBe("code.pr");
  });

  it("applies edits only when the text matches exactly once", () => {
    expect(applyEdits("alpha beta gamma", [{ find: "beta", replace: "BETA" }], "f")).toBe("alpha BETA gamma");
    expect(() => applyEdits("alpha", [{ find: "missing", replace: "" }], "f")).toThrow(/not found/);
    expect(() => applyEdits("dup dup", [{ find: "dup", replace: "x" }], "f")).toThrow(/more than once/);
  });
});
