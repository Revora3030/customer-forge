import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OWNER_ROUTINE_PRESETS, isOwnerRoutinePreset, scheduleLabel } from "./routine-presets";
import { ROUTINE_PRESETS } from "./routines.server";

describe("JC-53 owner routine presets", () => {
  it("only offers presets that cannot contact anyone", () => {
    for (const preset of OWNER_ROUTINE_PRESETS) expect(ROUTINE_PRESETS[preset].sendPolicy).toBe("no_external_actions");
    expect(isOwnerRoutinePreset("review_asks")).toBe(false);
    expect(isOwnerRoutinePreset("custom")).toBe(false);
    const migration = readFileSync("supabase/migrations/20261103040000_agent_routines.sql", "utf8");
    expect(migration).toMatch(/WHEN r\.preset IN \('weekly_digest', 'site_refresh'\) THEN 'no_external_actions'/);
  });

  it("reads schedules in plain words, in ET", () => {
    expect(scheduleLabel({ frequency: "weekly", weekday: 1, hour: 8, minute: 0 })).toBe("Every Monday at 8:00 AM ET");
    expect(scheduleLabel({ frequency: "monthly", monthDay: 1, hour: 9, minute: 0 })).toBe("On the 1st of each month at 9:00 AM ET");
    expect(scheduleLabel({ frequency: "monthly", monthDay: 22, hour: 13, minute: 5 })).toBe("On the 22nd of each month at 1:05 PM ET");
    expect(scheduleLabel({ frequency: "daily", hour: 0, minute: 30 })).toBe("Every day at 12:30 AM ET");
  });

  it("server functions guard by role: members read, only the owner writes", () => {
    const src = readFileSync("src/lib/agent/routines.functions.ts", "utf8");
    expect(src.match(/"owner"\)/g)?.length).toBe(4);
    expect(src).toMatch(/"viewer"\)/);
    expect(src).toMatch(/preset: z\.enum\(OWNER_ROUTINE_PRESETS\)/);
    expect(src).not.toMatch(/prompt:\s*z\./);
  });

  it("the panel is on the Automations page", () => {
    expect(readFileSync("src/routes/_authenticated/app.automations.tsx", "utf8")).toContain("<RoutinesPanel");
  });
});
