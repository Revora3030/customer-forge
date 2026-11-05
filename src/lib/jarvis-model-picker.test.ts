import { describe, expect, it } from "vitest";
import {
  buildModelPickerData,
  healthByModel,
  healthLabel,
  paidPickWarning,
  type PickerModel,
} from "./jarvis-model-picker";

const roster = ["google/gemini-3.8-flash", "openai/gpt-6.1-sol", "anthropic/claude-opus-5-5"] as const;

describe("jarvis model picker (JC-38)", () => {
  it("lists nothing but Auto when the provider is not configured", () => {
    const data = buildModelPickerData({
      configured: false,
      roster,
      registry: [{ model: "google/gemini-3.8-flash", provider: "google", display_name: "Flash", retired: false, paid: false }],
      trace: [{ model: "google/gemini-3.8-flash", ok: true, created_at: "2026-11-05T00:00:00Z" }],
      paidBudget: null,
      checkedAt: "2026-11-05T12:00:00Z",
    });
    expect(data.configured).toBe(false);
    expect(data.models).toEqual([]);
  });

  it("skips retired registry models and keeps roster unknowns", () => {
    const data = buildModelPickerData({
      configured: true,
      roster,
      registry: [
        { model: "google/gemini-3.8-flash", provider: "google", display_name: "Flash", retired: false, paid: false },
        { model: "openai/gpt-6.1-sol", provider: "openai", display_name: null, retired: true, paid: true },
      ],
      trace: [],
      paidBudget: null,
      checkedAt: "2026-11-05T12:00:00Z",
    });
    expect(data.models.map((m) => m.id)).toEqual(["google/gemini-3.8-flash", "anthropic/claude-opus-5-5"]);
    expect(data.models.find((m) => m.id.startsWith("anthropic/"))?.paid).toBeNull();
  });

  it("uses recorded health only; never invents a rate for unused models", () => {
    const data = buildModelPickerData({
      configured: true,
      roster,
      registry: null,
      trace: [
        { model: "google/gemini-3.8-flash", ok: true, created_at: "2026-11-04T10:00:00Z" },
        { model: "google/gemini-3.8-flash", ok: false, created_at: "2026-11-04T11:00:00Z" },
        { model: "Google/Gemini-3.8-Flash", ok: true, created_at: "2026-11-04T12:00:00Z" },
      ],
      paidBudget: null,
      checkedAt: "2026-11-05T12:00:00Z",
    });
    const flash = data.models.find((m) => m.id === "google/gemini-3.8-flash")!;
    expect(flash.health).toEqual({ kind: "recorded", calls: 3, ok: 2, lastSuccessAt: "2026-11-04T12:00:00Z" });
    expect(healthLabel(flash.health)).toBe("67% (2/3)");
    const sol = data.models.find((m) => m.id === "openai/gpt-6.1-sol")!;
    expect(sol.health).toEqual({ kind: "none" });
    expect(healthLabel(sol.health)).toBe("no recorded calls");
  });

  it("marks health unavailable when the trace cannot be read", () => {
    const data = buildModelPickerData({
      configured: true,
      roster: ["google/gemini-3.8-flash"],
      registry: null,
      trace: null,
      paidBudget: null,
      checkedAt: "2026-11-05T12:00:00Z",
    });
    expect(data.models[0]!.health).toEqual({ kind: "unavailable" });
    expect(healthLabel(data.models[0]!.health)).toBe("health unavailable");
  });

  it("warns only for paid picks and includes budget when known", () => {
    const paid: PickerModel = {
      id: "anthropic/claude-opus-5-5",
      label: "Opus",
      family: "anthropic",
      paid: true,
      health: { kind: "none" },
    };
    const free: PickerModel = { ...paid, id: "google/gemini-3.8-flash", paid: false };
    expect(paidPickWarning(null, null)).toBeNull();
    expect(paidPickWarning(free, null)).toBeNull();
    expect(paidPickWarning(paid, null)).toMatch(/paid AI budget/);
    expect(paidPickWarning(paid, { settledUsd: 1, openUsd: 0.5, capUsd: 5, day: "2026-11-05" })).toContain("$3.50 of $5.00 left");
  });

  it("healthByModel ignores rows with no model name", () => {
    const map = healthByModel([{ model: null, ok: true, created_at: "2026-11-05T00:00:00Z" }, { model: "  ", ok: true, created_at: "2026-11-05T00:00:00Z" }]);
    expect(map?.size).toBe(0);
  });
});
