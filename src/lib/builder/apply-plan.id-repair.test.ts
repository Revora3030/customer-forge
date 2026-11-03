import { describe, expect, it } from "vitest";
import { auditActionTargets, repairId } from "./apply-plan";
import type { AgentAction } from "@/lib/site-agent";

const A = "1b2c3d4e-0000-4000-8000-000000000001";
const B = "9f8e7d6c-0000-4000-8000-000000000002";
const pool = new Set([A, B]);

describe("repairId", () => {
  it("fixes a one-character slip to the only close real id", () => {
    expect(repairId(A.slice(0, -1) + "9", pool)).toBe(A);
  });
  it("fixes a unique shortened id", () => {
    expect(repairId("1b2c3d4e", pool)).toBe(A);
  });
  it("leaves an id that matches nothing so it is reported, not guessed", () => {
    expect(repairId("aaaaaaaa-1111-4111-8111-111111111111", pool)).toBe("aaaaaaaa-1111-4111-8111-111111111111");
  });
});

it("a near-miss section id still applies the owner's change", () => {
  const action = { type: "set_section_text", sectionId: A.toUpperCase(), field: "heading", value: "Hi" } as unknown as AgentAction;
  const audit = auditActionTargets([action], { pageIds: new Set(), sectionIds: pool, componentIds: new Set() });
  expect(audit.stale).toHaveLength(0);
  expect((audit.ok[0] as unknown as { sectionId: string }).sectionId).toBe(A);
});
