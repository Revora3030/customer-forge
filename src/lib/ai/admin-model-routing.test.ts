import { describe, expect, it } from "vitest";
import { adminRoutingModels, validateAdminRoutingIds } from "./admin-model-routing";
import type { CatalogueModel } from "./catalogue";

const model = (id: string, extra: Partial<CatalogueModel> = {}): CatalogueModel => ({ id, deprecated: false, surfaces: ["chat-completions"], inputs: ["text", "image"], outputs: ["text"], retentionBySurface: {}, ...extra });
const catalogue = [model("openai/current"), model("google/other"), model("openai/old", { deprecated: true }), model("openai/image", { surfaces: ["image-generation"] })];
const roster = { primary: "openai/current,openai/old", vision: "openai/current,google/other", image: "openai/image" };

describe("admin Lovable routing inventory", () => {
  it("shows only compatible configured models, with exact prefixed ids and no dedicated media controls", () => {
    const rows = adminRoutingModels(roster, catalogue, []);
    expect(rows.map(row => row.model)).toEqual(["openai/current", "google/other"]);
    expect(rows[0]?.roles).toEqual(["primary", "vision"]);
    expect(rows.every(row => row.provider === "lovable")).toBe(true);
  });
  it("does not turn legacy provider history into a selectable model or a Lovable success", () => {
    const rows = adminRoutingModels(roster, catalogue, [
      { provider: "cerebras", model: "gpt-oss-120b", ok: true },
      { provider: "openai", model: "current", ok: true },
      { provider: "lovable", model: "current", ok: true },
      { provider: "lovable", model: "openai/current", ok: false },
      { provider: "lovable", model: "openai/current", ok: null },
    ]);
    expect(rows[0]).toMatchObject({ calls: 3, successes: 1, failures: 1 });
    expect(rows.some(row => row.model.includes("oss"))).toBe(false);
  });
  it("rejects obsolete, bare, unknown and dedicated media ids on save", () => {
    const rows = adminRoutingModels(roster, catalogue, []);
    for (const id of ["current", "openai/old", "cerebras/gpt-oss-120b", "openai/image"]) {
      expect(() => validateAdminRoutingIds([id], rows)).toThrow("no longer eligible");
    }
    expect(validateAdminRoutingIds(["openai/current", "openai/current"], rows)).toEqual(["openai/current"]);
  });
  it("never claims eligibility when the catalogue is absent", () => {
    expect(adminRoutingModels(roster, [], [])).toEqual([]);
  });
});