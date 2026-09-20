import { describe, expect, it } from "vitest";
import {
  describeCustomBlock,
  parseCustomBlock,
  readCustomBlock,
  writeCustomBlock,
} from "./custom-block";

describe("custom interactive blocks", () => {
  it("accepts a price estimator and keeps the estimate note", () => {
    const result = parseCustomBlock({
      type: "calculator",
      title: "Detailing estimate",
      note: "Guide price only — we confirm after seeing the vehicle.",
      base: 80,
      resultLabel: "Your estimate",
      fields: [
        { id: "size", label: "Vehicle size", kind: "select", options: [
          { label: "Car", value: 0 },
          { label: "SUV", value: 40 },
        ] },
        { label: "Extra seats", kind: "number", rate: 15, min: 0, max: 5, step: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.type).toBe("calculator");
    if (result.spec.type !== "calculator") return;
    expect(result.spec.base).toBe(80);
    expect(result.spec.fields).toHaveLength(2);
    expect(result.spec.note).toContain("Guide price only");
  });

  it("refuses an estimator with no estimate note", () => {
    const result = parseCustomBlock({
      type: "calculator",
      base: 10,
      fields: [{ label: "Rooms", kind: "number", rate: 20 }],
    });
    expect(result).toEqual({
      ok: false,
      reason: "an estimator must carry a note saying the result is an estimate",
    });
  });

  it("refuses markup and script text anywhere in a spec", () => {
    const result = parseCustomBlock({
      type: "checklist",
      items: [{ label: "<script>alert(1)</script>" }, { label: "Fine" }],
    });
    expect(result.ok).toBe(false);
  });

  it("requires every quiz answer to point at a listed result", () => {
    const result = parseCustomBlock({
      type: "quiz",
      questions: [
        { prompt: "What do you need?", options: [
          { label: "A repair", outcome: "repair" },
          { label: "A new install", outcome: "missing" },
        ] },
      ],
      outcomes: [
        { id: "repair", label: "Repair visit" },
        { id: "install", label: "Installation" },
      ],
    });
    expect(result).toEqual({
      ok: false,
      reason: "every answer must point at one of the listed results",
    });
  });

  it("requires one comparison cell per column", () => {
    const result = parseCustomBlock({
      type: "comparison",
      columns: ["Standard", "Premium"],
      rows: [{ label: "Turnaround", cells: ["3 days"] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown block types with an exact reason", () => {
    const result = parseCustomBlock({ type: "3d_spaceship" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("unknown block type");
  });

  it("round-trips through the section settings JSON without losing other keys", () => {
    const parsed = parseCustomBlock({
      type: "metrics",
      items: [
        { label: "Years in business", value: "12" },
        { label: "Jobs completed", value: "800+" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const settings = writeCustomBlock({ visual: { layout: "grid" } }, parsed.spec);
    expect(settings["visual"]).toEqual({ layout: "grid" });
    expect(readCustomBlock(settings)).toEqual(parsed.spec);
    expect(readCustomBlock({ custom: { type: "nope" } })).toBeNull();
    expect(describeCustomBlock(parsed.spec)).toContain("2 values");
  });
});
