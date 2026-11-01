import { describe, expect, it } from "vitest";
import {
  hasPhoneChanges,
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
