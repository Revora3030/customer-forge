import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { summarizeWork, workWindows, WORK_ITEMS, type WorkCounts } from "./work-done";
import { WorkDoneView } from "@/components/app/WorkDoneCard";

const zero = (): WorkCounts =>
  Object.fromEntries(WORK_ITEMS.map((item) => [item.key, 0])) as WorkCounts;

describe("work done summary", () => {
  it("windows are two equal back-to-back periods", () => {
    const w = workWindows(new Date("2026-10-30T12:00:00Z"), 30);
    expect(w.end).toBe("2026-10-30T12:00:00.000Z");
    expect(w.start).toBe("2026-09-30T12:00:00.000Z");
    expect(w.prevStart).toBe("2026-08-31T12:00:00.000Z");
  });

  it("keeps real counts in a fixed order with change vs the previous window", () => {
    const now = { ...zero(), leadAlerts: 7, followUps: 12, siteChecks: 40 };
    const before = { ...zero(), leadAlerts: 3, followUps: 12 };
    const s = summarizeWork(now, before);
    expect(s.lines.map((l) => l.key)).toEqual(["leadAlerts", "followUps", "siteChecks"]);
    expect(s.lines[0]).toMatchObject({ current: 7, previous: 3, change: 4 });
    expect(s.lines[1]?.change).toBe(0);
    expect(s.total).toBe(59);
    expect(s.unavailable).toEqual([]);
  });

  it("shows a zero only when the previous window had work", () => {
    const s = summarizeWork(zero(), { ...zero(), weeklyReports: 4 });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ key: "weeklyReports", current: 0, change: -4 });
  });

  it("never turns an unreadable record into a zero", () => {
    const s = summarizeWork({ ...zero(), publishes: null, leadAlerts: 2 }, { ...zero(), leadAlerts: null });
    expect(s.unavailable).toEqual(["Website updates published"]);
    expect(s.lines[0]).toMatchObject({ key: "leadAlerts", current: 2, previous: null, change: null });
  });

  it("renders an honest empty state and the counts", () => {
    expect(renderToStaticMarkup(createElement(WorkDoneView, { summary: summarizeWork(zero(), zero()) }))).toContain(
      "Nothing to show yet",
    );
    const html = renderToStaticMarkup(
      createElement(WorkDoneView, { summary: summarizeWork({ ...zero(), leadAlerts: 5 }, { ...zero(), leadAlerts: 2 }) }),
    );
    expect(html).toContain("New-lead alerts sent to you");
    expect(html).toContain("+3 vs previous 30 days");
  });
});
