import { describe, expect, it } from "vitest";
import { emitTextDelta, partialJsonStringField, withTextDeltas } from "./text-delta-scope.server";

describe("partialJsonStringField", () => {
  it("reads an unfinished reply", () => {
    expect(partialJsonStringField('{"reply":"Sure \\u2014 I\'ll ma', "reply")).toBe("Sure — I'll ma");
  });
  it("stops at the closing quote and decodes escapes", () => {
    expect(partialJsonStringField('{"reply":"a\\n\\"b\\"","summary":"x"}', "reply")).toBe('a\n"b"');
  });
  it("is null before the field starts", () => {
    expect(partialJsonStringField('{"rep', "reply")).toBeNull();
  });
});

describe("withTextDeltas", () => {
  it("delivers text only inside the scope", async () => {
    const seen: string[] = [];
    emitTextDelta("outside");
    await withTextDeltas((t) => seen.push(t), async () => {
      await Promise.resolve();
      emitTextDelta("inside");
    });
    expect(seen).toEqual(["inside"]);
  });
});
