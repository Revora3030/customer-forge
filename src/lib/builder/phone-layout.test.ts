import { describe, expect, it } from "vitest";
import {
  guardPhoneLayout,
  hasPhoneChanges,
  isLeadSection,
  phoneMoveBlocked,
  phoneOrder,
  phoneState,
  planPhoneHidden,
  planPhoneMove,
  planPhoneReset,
} from "@/lib/builder/phone-layout";
import {
  blockRules,
  hasMobileOrder,
  mobileOrderRules,
  readBlockStyle,
  styleSheet,
  writeBlockStyle,
} from "@/lib/site-style";

const make = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `sect-${i + 1}`, settings: {} as unknown, sort_order: i }));

const apply = <T extends { id: string; settings: unknown }>(list: T[], patches: { id: string; settings: Record<string, unknown> }[]) =>
  list.map((s) => ({ ...s, settings: patches.find((p) => p.id === s.id)?.settings ?? s.settings }));

describe("phone-only section controls", () => {
  it("hides a section on phones only and leaves desktop and tablet alone", () => {
    const [sec1] = make(1);
    const patch = planPhoneHidden(sec1!, true);
    expect(phoneState({ ...sec1!, settings: patch.settings }).hiddenOnPhone).toBe(true);
    expect(readBlockStyle(patch.settings, "desktop").hidden).toBeNull();
    expect(readBlockStyle(patch.settings, "tablet").hidden).toBeNull();
    const css = blockRules("sect-1", patch.settings);
    expect(css).toBe('@media (max-width:639px){[data-rvb="sect-1"]{display:none !important}}');
    // Showing again removes the layer entirely.
    expect(planPhoneHidden({ ...sec1!, settings: patch.settings }, false).settings).toEqual({ style: {} });
  });

  it("showing a tablet-hidden section on phones writes an explicit override", () => {
    const settings = writeBlockStyle({}, { hidden: true }, "tablet");
    const patch = planPhoneHidden({ id: "sect-1", settings, sort_order: 0 }, false);
    expect(readBlockStyle(patch.settings, "mobile").hidden).toBe(false);
    expect(readBlockStyle(patch.settings, "tablet").hidden).toBe(true);
  });

  it("moves sections on phones only, keeping everyone's position explicit", () => {
    let list = make(4);
    list = apply(list, planPhoneMove(list, "sect-3", "up"));
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["sect-1", "sect-3", "sect-2", "sect-4"]);
    list = apply(list, planPhoneMove(list, "sect-1", "down"));
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["sect-3", "sect-1", "sect-2", "sect-4"]);
    // Desktop order (sort_order) is untouched.
    expect(list.map((s) => s.sort_order)).toEqual([0, 1, 2, 3]);
    expect(planPhoneMove(list, "sect-3", "up")).toEqual([]);
    expect(planPhoneMove(list, "sect-4", "down")).toEqual([]);
    expect(planPhoneMove(list, "nope", "down")).toEqual([]);
  });

  it("emits order only for the phone layer", () => {
    const mobile = writeBlockStyle({}, { order: 2 }, "mobile");
    expect(blockRules("sect-1", mobile)).toBe('@media (max-width:639px){[data-rvb="sect-1"]{order:2 !important}}');
    const tablet = writeBlockStyle({}, { order: 2 }, "tablet");
    expect(blockRules("sect-1", tablet)).toBe("");
    const desktop = writeBlockStyle({}, { order: 2 }, "desktop");
    expect(blockRules("sect-1", desktop)).toBe("");
    expect(hasMobileOrder([{ settings: tablet }, { settings: desktop }])).toBe(false);
    expect(hasMobileOrder([{ settings: mobile }])).toBe(true);
  });

  it("only turns on the phone flex container when something was reordered", () => {
    expect(mobileOrderRules([{ settings: {} }])).toBe("");
    const css = mobileOrderRules([{ settings: writeBlockStyle({}, { order: 1 }, "mobile") }]);
    expect(css).toContain("@media (max-width:639px)");
    expect(css).toContain("main[data-rv-mobile-order]{display:flex;flex-direction:column}");
    expect(css).not.toMatch(/^[^@]/);
  });

  it("rejects out-of-range or non-integer order values", () => {
    for (const bad of [0, -1, 201, "first", NaN]) {
      expect(readBlockStyle(writeBlockStyle({}, { order: bad }, "mobile"), "mobile").order).toBeNull();
    }
    expect(readBlockStyle(writeBlockStyle({}, { order: 3.4 }, "mobile"), "mobile").order).toBe(3);
  });

  it("reset clears phone order and hiding and nothing else", () => {
    let list = make(3).map((s) => ({ ...s, settings: writeBlockStyle({}, { bgColor: "#112233" }) }));
    list = apply(list, planPhoneMove(list, "sect-2", "up"));
    list = apply(list, [planPhoneHidden(list[2]!, true)]);
    expect(hasPhoneChanges(list)).toBe(true);
    list = apply(list, planPhoneReset(list));
    expect(hasPhoneChanges(list)).toBe(false);
    expect(readBlockStyle(list[0]!.settings).bgColor).toBe("#112233");
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["sect-1", "sect-2", "sect-3"]);
    expect(styleSheet(list)).toBe("");
  });
});

describe("assistant 'on mobile…' requests use the same phone controls", () => {
  it("a mobile hide/order style action becomes phone-only CSS", async () => {
    const { readActions } = await import("@/lib/site-agent");
    const actions = readActions(
      [
        { type: "set_block_style", target: "section", targetId: "sect-1", device: "mobile", patch: { hidden: true } },
        { type: "set_block_style", target: "section", targetId: "sect-2", device: "mobile", patch: { order: 1 } },
      ],
      { pageIds: new Set(), sectionIds: new Set(["sect-1", "sect-2"]), componentIds: new Set() },
    );
    expect(actions).toEqual([
      expect.objectContaining({ device: "mobile", patch: { hidden: true } }),
      expect.objectContaining({ device: "mobile", patch: { order: 1 } }),
    ]);
    const first = actions[0] as { patch: Record<string, unknown>; device: "mobile" };
    const second = actions[1] as { patch: Record<string, unknown>; device: "mobile" };
    const css = styleSheet([
      { id: "sect-1", settings: writeBlockStyle({}, first.patch, first.device) },
      { id: "sect-2", settings: writeBlockStyle({}, second.patch, second.device) },
    ]);
    expect(css).toContain('@media (max-width:639px){[data-rvb="sect-1"]{display:none !important}}');
    expect(css).toContain('@media (max-width:639px){[data-rvb="sect-2"]{order:1 !important}}');
  });
});

describe("lead section guard (enquiry, quote and booking sections stay reachable on phones)", () => {
  const withKinds = (kinds: string[]) =>
    kinds.map((kind, i) => ({ id: `sect-${i + 1}`, kind, settings: {} as unknown, sort_order: i }));

  it("recognises lead sections from kind, stored role and form widgets", () => {
    for (const kind of ["contact", "quote", "booking"]) expect(isLeadSection({ kind, settings: {} })).toBe(true);
    for (const kind of ["hero", "services", "faq", "cta", "composition", "policy"]) {
      expect(isLeadSection({ kind, settings: {} })).toBe(false);
    }
    expect(isLeadSection({ kind: "composition", settings: { role: "contact" } })).toBe(true);
    const tree = { type: "stack", children: [{ type: "widget", text: "enquiry_form" }] };
    expect(isLeadSection({ kind: "composition", settings: { composition: { root: tree } } })).toBe(true);
    const other = { type: "stack", children: [{ type: "widget", text: "review_wall" }] };
    expect(isLeadSection({ kind: "composition", settings: { composition: { root: other } } })).toBe(false);
  });

  it("a hide request on the lead section keeps it shown", () => {
    const [contact] = withKinds(["contact"]);
    const patch = planPhoneHidden(contact!, true);
    expect(phoneState({ ...contact!, settings: patch.settings }).hiddenOnPhone).toBe(false);
    expect(blockRules("sect-1", patch.settings)).not.toContain("display:none");
    // Other sections can still be hidden.
    const [hero] = withKinds(["hero"]);
    expect(blockRules("sect-1", planPhoneHidden(hero!, true).settings)).toContain("display:none");
  });

  it("a stored or chat-applied hidden flag on the lead section is ignored", () => {
    const list = withKinds(["hero", "services", "contact"]).map((s) =>
      s.kind === "contact" ? { ...s, settings: writeBlockStyle({}, { hidden: true }, "mobile") } : s,
    );
    const guarded = guardPhoneLayout(list);
    expect(styleSheet(guarded)).not.toContain("display:none");
    expect(phoneState(guarded[2]!).hiddenOnPhone).toBe(false);
    // Hiding any other section is untouched.
    const hidden = list.map((s) => (s.kind === "services" ? { ...s, settings: writeBlockStyle({}, { hidden: true }, "mobile") } : s));
    expect(styleSheet(guardPhoneLayout(hidden))).toContain('[data-rvb="sect-2"]{display:none !important}');
  });

  it("a tablet-hidden lead section is shown again at phone width", () => {
    const list = withKinds(["hero", "booking"]).map((s) =>
      s.kind === "booking" ? { ...s, settings: writeBlockStyle({}, { hidden: true }, "tablet") } : s,
    );
    const css = styleSheet(guardPhoneLayout(list));
    expect(css).toContain('@media (max-width:639px){[data-rvb="sect-2"]{display:revert !important}}');
  });

  it("the lead section can't be moved lower than it is on desktop", () => {
    const list = withKinds(["hero", "services", "contact", "faq"]);
    // Moving it down is refused, and so is pulling the section below it above it.
    expect(phoneMoveBlocked(list, "sect-3", "down")).toMatch(/enquiry form/);
    expect(planPhoneMove(list, "sect-3", "down")).toEqual([]);
    expect(phoneMoveBlocked(list, "sect-4", "up")).not.toBeNull();
    expect(planPhoneMove(list, "sect-4", "up")).toEqual([]);
    // Moving the lead up, or a section from above it to below... is allowed (lead only gets earlier).
    expect(phoneMoveBlocked(list, "sect-3", "up")).toBeNull();
    expect(phoneMoveBlocked(list, "sect-2", "down")).toBeNull();
    // Unrelated sections move freely.
    expect(planPhoneMove(list, "sect-2", "up").length).toBeGreaterThan(0);
  });

  it("the lead section is never pushed below a section that follows it on desktop", () => {
    // A lead that closes the page stays at the very end of what it can reach: it can't be pushed
    // below a section that follows it on desktop (a policy page section, for example).
    let list = withKinds(["hero", "services", "contact", "policy"]);
    expect(planPhoneMove(list, "sect-4", "up")).toEqual([]);
    expect(planPhoneMove(list, "sect-3", "down")).toEqual([]);
    // Every reachable layout keeps the lead at or above its desktop position.
    for (const step of [
      ["sect-2", "up"], ["sect-1", "down"], ["sect-3", "up"], ["sect-4", "up"], ["sect-3", "down"], ["sect-2", "down"],
    ] as const) {
      list = apply(list, planPhoneMove(list, step[0], step[1]));
      expect(phoneOrder(list).findIndex((s) => s.id === "sect-3")).toBeLessThanOrEqual(2);
    }
  });

  it("a saved phone order that buries the lead section is ignored when the page renders", () => {
    const list = withKinds(["hero", "services", "contact", "faq"]).map((s, i) => ({
      ...s,
      // contact (3rd on desktop) saved as last on phones
      settings: writeBlockStyle({}, { order: [1, 2, 4, 3][i]! }, "mobile"),
    }));
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["sect-1", "sect-2", "sect-4", "sect-3"]);
    const guarded = guardPhoneLayout(list);
    expect(phoneOrder(guarded).map((s) => s.id)).toEqual(["sect-1", "sect-2", "sect-3", "sect-4"]);
    expect(mobileOrderRules(guarded)).toBe("");
    // A harmless order (lead moved earlier) is kept.
    const earlier = withKinds(["hero", "services", "contact", "faq"]).map((s, i) => ({
      ...s,
      settings: writeBlockStyle({}, { order: [1, 3, 2, 4][i]! }, "mobile"),
    }));
    expect(guardPhoneLayout(earlier)).toBe(earlier);
  });

  it("leaves a page with no lead section completely alone", () => {
    const list = withKinds(["hero", "services", "faq"]);
    expect(guardPhoneLayout(list)).toBe(list);
  });
});
