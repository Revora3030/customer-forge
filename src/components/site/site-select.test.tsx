import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteSelect } from "./SiteSelect";
import { DateChips } from "./DateChips";
import { selectKeyAction, typeaheadIndex } from "@/lib/site-select";
import { dateChipDays, localIsoToday, nextOpenChip } from "@/lib/date-chips";

describe("custom select keyboard model (quality bar #1)", () => {
  it("opens on arrows/Enter/Space and jumps with Home/End when closed", () => {
    expect(selectKeyAction("ArrowDown", false, 2, 5)).toEqual({ kind: "open", active: 2 });
    expect(selectKeyAction("Enter", false, 0, 5)).toEqual({ kind: "open", active: 0 });
    expect(selectKeyAction(" ", false, 1, 5)).toEqual({ kind: "open", active: 1 });
    expect(selectKeyAction("Home", false, 3, 5)).toEqual({ kind: "open", active: 0 });
    expect(selectKeyAction("End", false, 0, 5)).toEqual({ kind: "open", active: 4 });
    expect(selectKeyAction("x", false, 0, 5)).toEqual({ kind: "none" });
  });
  it("moves, clamps, pages, chooses and closes when open", () => {
    expect(selectKeyAction("ArrowDown", true, 4, 5)).toEqual({ kind: "move", active: 4 });
    expect(selectKeyAction("ArrowUp", true, 0, 5)).toEqual({ kind: "move", active: 0 });
    expect(selectKeyAction("PageDown", true, 0, 30)).toEqual({ kind: "move", active: 10 });
    expect(selectKeyAction("PageUp", true, 4, 30)).toEqual({ kind: "move", active: 0 });
    expect(selectKeyAction("Enter", true, 3, 5)).toMatchObject({ kind: "choose", active: 3 });
    expect(selectKeyAction("Tab", true, 2, 5)).toMatchObject({ kind: "choose", active: 2 });
    expect(selectKeyAction("ArrowUp", true, 2, 5, true)).toMatchObject({ kind: "choose", active: 2 });
    expect(selectKeyAction("Escape", true, 2, 5)).toEqual({ kind: "close" });
    expect(selectKeyAction("ArrowDown", true, 0, 0)).toEqual({ kind: "none" });
  });
  it("type-to-select wraps and cycles on a repeated letter", () => {
    const labels = ["Basic wash", "Ceramic coat", "Clay bar", "Interior detail"];
    expect(typeaheadIndex(labels, "c", 0)).toBe(1);
    expect(typeaheadIndex(labels, "cc", 1)).toBe(2);
    expect(typeaheadIndex(labels, "c", 2)).toBe(1);
    expect(typeaheadIndex(labels, "cla", 0)).toBe(2);
    expect(typeaheadIndex(labels, "zzz", 0)).toBe(-1);
  });
  it("server/no-JS render is a native select with the same name and values", () => {
    const html = renderToStaticMarkup(
      <SiteSelect id="svc" name="service" labelledBy="svc-label" defaultValue="" options={[{ value: "", label: "Not sure yet" }, { value: "Deep clean", label: "Deep clean" }]} />,
    );
    expect(html).toContain('<select id="svc" name="service" aria-labelledby="svc-label"');
    expect(html).toContain('<option value="" selected="">Not sure yet</option>');
    expect(html).toContain('<option value="Deep clean">Deep clean</option>');
  });
  it("a controlled select keeps the controlled value on the server render", () => {
    const html = renderToStaticMarkup(
      <SiteSelect value="2" onChange={() => {}} ariaLabel="Size" options={[{ value: "1", label: "Small" }, { value: "2", label: "Large" }]} />,
    );
    expect(html).toContain('aria-label="Size"');
    expect(html).toContain('<option value="2" selected="">Large</option>');
  });
});

describe("booking date chips (quality bar #1)", () => {
  it("lists consecutive days with accessible labels across a month rollover", () => {
    const chips = dateChipDays("2026-10-30", 4, null);
    expect(chips.map((c) => c.iso)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(chips[0]).toMatchObject({ relative: "Today", weekday: "Fri", day: 30, month: "Oct", label: "Today, Friday 30 October" });
    expect(chips[1]!.label).toBe("Tomorrow, Saturday 31 October");
    expect(chips[2]!.label).toBe("Sunday 1 November");
  });
  it("marks only explicitly closed days and never hides a day for unreadable hours", () => {
    const hours = { mon: "8am-5pm", tue: "8am-5pm", sun: "Closed" };
    const chips = dateChipDays("2026-11-01", 3, hours);
    expect(chips.map((c) => c.closed)).toEqual([true, false, false]);
    expect(dateChipDays("2026-11-01", 7, "garbage").some((c) => c.closed)).toBe(false);
    expect(dateChipDays("2026-02-30", 3, null)).toEqual([]);
  });
  it("arrow navigation skips closed days and stops at the ends", () => {
    const chips = dateChipDays("2026-11-01", 8, { sun: "Closed", sat: "Closed", mon: "9-5" });
    expect(nextOpenChip(chips, 0, 1)).toBe(1);
    // Fri 6th is followed only by closed days (Sat 7th, Sun 8th): focus stays.
    expect(nextOpenChip(chips, 5, 1)).toBe(5);
    // Mon 2nd has only a closed Sunday before it: focus stays.
    expect(nextOpenChip(chips, 1, -1)).toBe(1);
    expect(nextOpenChip(chips, 3, -1)).toBe(2);
  });
  it("today is the visitor's local calendar date", () => {
    expect(localIsoToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
  it("server/no-JS render is the native date input (same name, min, required)", () => {
    const html = renderToStaticMarkup(
      <DateChips id="d" name="date" value="" onChange={() => {}} hours={null} labelledBy="dl" fallback={<input id="d" name="date" type="date" min="2026-10-29" required />} />,
    );
    expect(html).toMatch(/^<in[p]ut /);
    for (const attr of ['name="date"', 'type="date"', 'min="2026-10-29"', 'required=""']) expect(html).toContain(attr);
    expect(html).not.toContain("radiogroup");
  });
});

