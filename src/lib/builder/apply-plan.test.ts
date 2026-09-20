import { describe, expect, it } from "vitest";
import type { AgentAction } from "@/lib/site-agent";
import {
  auditActionTargets,
  dedupeActions,
  orderActionsForApply,
  preflightActions,
  stalePlanMessage,
} from "./apply-plan";

const PAGE = "11111111-1111-4111-8111-111111111111";
const SECTION = "22222222-2222-4222-8222-222222222222";
const COMPONENT = "33333333-3333-4333-8333-333333333333";

const known = () => ({
  pageIds: new Set([PAGE]),
  sectionIds: new Set([SECTION]),
  componentIds: new Set([COMPONENT]),
});

describe("orderActionsForApply", () => {
  it("creates a page before the section that fills it, even when the plan was reordered", () => {
    const actions: AgentAction[] = [
      { type: "add_section", pageId: "temp_page_1", kind: "hero", ref: "temp_hero" },
      { type: "add_page", kind: "custom", title: "Services", slug: "services", ref: "temp_page_1" },
    ];
    expect(orderActionsForApply(actions).map((a) => a.type)).toEqual(["add_page", "add_section"]);
  });

  it("runs removals after edits and keeps unrelated order stable", () => {
    const actions: AgentAction[] = [
      { type: "delete_section", sectionId: SECTION },
      { type: "set_section_text", sectionId: SECTION, field: "heading", value: "A" },
      { type: "set_section_variant", sectionId: SECTION, variant: "split" },
    ];
    expect(orderActionsForApply(actions).map((a) => a.type)).toEqual([
      "set_section_text",
      "set_section_variant",
      "delete_section",
    ]);
  });
});

describe("dedupeActions", () => {
  it("drops an exact repeat so a retry cannot write the same change twice", () => {
    const one: AgentAction = { type: "add_section", pageId: PAGE, kind: "cta" };
    const result = dedupeActions([one, { ...one }, { type: "add_section", pageId: PAGE, kind: "faq" }]);
    expect(result.duplicates).toBe(1);
    expect(result.actions).toHaveLength(2);
  });

  it("keeps two creations that carry different references", () => {
    const result = dedupeActions([
      { type: "add_component", sectionId: SECTION, kind: "button", ref: "a" },
      { type: "add_component", sectionId: SECTION, kind: "button", ref: "b" },
    ]);
    expect(result.duplicates).toBe(0);
  });
});

describe("auditActionTargets", () => {
  it("reports a deleted section instead of silently dropping the step", () => {
    const audit = auditActionTargets(
      [{ type: "set_section_text", sectionId: "44444444-4444-4444-8444-444444444444", field: "heading", value: "Hi" }],
      known(),
    );
    expect(audit.ok).toHaveLength(0);
    expect(audit.stale).toEqual([
      { type: "set_section_text", target: "44444444-4444-4444-8444-444444444444", reason: "missing_section" },
    ]);
  });

  it("accepts references created earlier in the same batch", () => {
    const audit = auditActionTargets(
      [
        { type: "add_page", kind: "custom", title: "Services", slug: "services", ref: "temp_page_1" },
        { type: "add_section", pageId: "temp_page_1", kind: "hero", ref: "temp_hero" },
        { type: "add_component", sectionId: "temp_hero", kind: "button", link_url: "/contact" },
      ],
      known(),
    );
    expect(audit.stale).toHaveLength(0);
    expect(audit.ok).toHaveLength(3);
  });

  it("rejects a reorder that names a section which no longer exists", () => {
    const audit = auditActionTargets(
      [{ type: "reorder_sections", pageId: PAGE, sectionIds: [SECTION, "55555555-5555-4555-8555-555555555555"] }],
      known(),
    );
    expect(audit.ok).toHaveLength(0);
    expect(audit.stale[0]?.reason).toBe("missing_section");
  });

  it("keeps the changes that still fit when only some targets are gone", () => {
    const audit = auditActionTargets(
      [
        { type: "set_section_text", sectionId: SECTION, field: "heading", value: "Kept" },
        { type: "delete_component", componentId: "66666666-6666-4666-8666-666666666666" },
      ],
      known(),
    );
    expect(audit.ok).toHaveLength(1);
    expect(audit.stale).toHaveLength(1);
  });
});

describe("stalePlanMessage", () => {
  it("asks for a fresh plan when nothing in the batch still fits", () => {
    const message = stalePlanMessage([{ type: "set_section_text", target: "x", reason: "missing_section" }], 1);
    expect(message).toContain("changed while Revora was working");
  });

  it("explains a partial skip without asking for a new plan", () => {
    const message = stalePlanMessage([{ type: "delete_component", target: "x", reason: "missing_component" }], 4);
    expect(message).toContain("kept the updates that still fit");
  });

  it("says nothing when every target resolves", () => {
    expect(stalePlanMessage([], 3)).toBe("");
  });
});

describe("preflightActions", () => {
  it("orders, dedupes and audits in one pass", () => {
    const result = preflightActions(
      [
        { type: "add_section", pageId: "temp_page_1", kind: "hero" },
        { type: "add_page", kind: "custom", title: "S", slug: "s", ref: "temp_page_1" },
        { type: "add_page", kind: "custom", title: "S", slug: "s", ref: "temp_page_1" },
        { type: "set_section_text", sectionId: "99999999-9999-4999-8999-999999999999", field: "heading", value: "x" },
      ],
      known(),
    );
    expect(result.duplicates).toBe(1);
    expect(result.ok.map((a) => a.type)).toEqual(["add_page", "add_section"]);
    expect(result.stale).toHaveLength(1);
  });
});
