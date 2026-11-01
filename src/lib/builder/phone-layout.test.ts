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
  Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, settings: {} as unknown, sort_order: i }));

const apply = <T extends { id: string; settings: unknown }>(list: T[], patches: { id: string; settings: Record<string, unknown> }[]) =>
  list.map((s) => ({ ...s, settings: patches.find((p) => p.id === s.id)?.settings ?? s.settings }));

describe("phone-only section controls", () => {
  it("hides a section on phones only and leaves desktop and tablet alone", () => {
    const [s1] = make(1);
    const patch = planPhoneHidden(s1!, true);
    expect(phoneState({ ...s1!, settings: patch.settings }).hiddenOnPhone).toBe(true);
    expect(readBlockStyle(patch.settings, "desktop").hidden).toBeNull();
    expect(readBlockStyle(patch.settings, "tablet").hidden).toBeNull();
    const css = blockRules("s1", patch.settings);
    expect(css).toBe('@media (max-width:639px){[data-rvb="s1"]{display:none !important}}');
    // Showing again removes the layer entirely.
    expect(planPhoneHidden({ ...s1!, settings: patch.settings }, false).settings).toEqual({ style: {} });
  });

  it("showing a tablet-hidden section on phones writes an explicit override", () => {
    const settings = writeBlockStyle({}, { hidden: true }, "tablet");
    const patch = planPhoneHidden({ id: "s1", settings, sort_order: 0 }, false);
    expect(readBlockStyle(patch.settings, "mobile").hidden).toBe(false);
    expect(readBlockStyle(patch.settings, "tablet").hidden).toBe(true);
  });

  it("moves sections on phones only, keeping everyone's position explicit", () => {
    let list = make(4);
    list = apply(list, planPhoneMove(list, "s3", "up"));
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["s1", "s3", "s2", "s4"]);
    list = apply(list, planPhoneMove(list, "s1", "down"));
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["s3", "s1", "s2", "s4"]);
    // Desktop order (sort_order) is untouched.
    expect(list.map((s) => s.sort_order)).toEqual([0, 1, 2, 3]);
    expect(planPhoneMove(list, "s3", "up")).toEqual([]);
    expect(planPhoneMove(list, "s4", "down")).toEqual([]);
    expect(planPhoneMove(list, "nope", "down")).toEqual([]);
  });

  it("emits order only for the phone layer", () => {
    const mobile = writeBlockStyle({}, { order: 2 }, "mobile");
    expect(blockRules("s1", mobile)).toBe('@media (max-width:639px){[data-rvb="s1"]{order:2 !important}}');
    const tablet = writeBlockStyle({}, { order: 2 }, "tablet");
    expect(blockRules("s1", tablet)).toBe("");
    const desktop = writeBlockStyle({}, { order: 2 }, "desktop");
    expect(blockRules("s1", desktop)).toBe("");
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
    list = apply(list, planPhoneMove(list, "s2", "up"));
    list = apply(list, [planPhoneHidden(list[2]!, true)]);
    expect(hasPhoneChanges(list)).toBe(true);
    list = apply(list, planPhoneReset(list));
    expect(hasPhoneChanges(list)).toBe(false);
    expect(readBlockStyle(list[0]!.settings).bgColor).toBe("#112233");
    expect(phoneOrder(list).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(styleSheet(list)).toBe("");
  });
});

describe("assistant 'on mobile…' requests use the same phone controls", () => {
  it("a mobile hide/order style action becomes phone-only CSS", async () => {
    const { readActions } = await import("@/lib/site-agent");
    const actions = readActions(
      [
        { type: "set_block_style", target: "section", targetId: "s1", device: "mobile", patch: { hidden: true } },
        { type: "set_block_style", target: "section", targetId: "s2", device: "mobile", patch: { order: 1 } },
      ],
      { pageIds: new Set(), sectionIds: new Set(["s1", "s2"]), componentIds: new Set() },
    );
    expect(actions).toEqual([
      expect.objectContaining({ device: "mobile", patch: { hidden: true } }),
      expect.objectContaining({ device: "mobile", patch: { order: 1 } }),
    ]);
    const first = actions[0] as { patch: Record<string, unknown>; device: "mobile" };
    const second = actions[1] as { patch: Record<string, unknown>; device: "mobile" };
    const css = styleSheet([
      { id: "s1", settings: writeBlockStyle({}, first.patch, first.device) },
      { id: "s2", settings: writeBlockStyle({}, second.patch, second.device) },
    ]);
    expect(css).toContain('@media (max-width:639px){[data-rvb="s1"]{display:none !important}}');
    expect(css).toContain('@media (max-width:639px){[data-rvb="s2"]{order:1 !important}}');
  });
});
