import { describe, expect, it } from "vitest";
import {
  appendReplyMeta,
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
    expect(parsed.proposals[0]?.input.businessName).toBe("Triangle Comfort");
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
    expect(meta.proposals[0]?.input.businessName).toBe("Triangle Comfort");
    expect(speakableText(stored)).toBe("Done.");
  });

  it("leaves plain replies untouched", () => {
    expect(appendReplyMeta("Hi", { ran: [], proposals: [] })).toBe("Hi");
    expect(splitReplyMeta("Hi").meta).toEqual({ ran: [], proposals: [] });
  });
});
