import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const tables = read("20261019090100_prospect_autopilot.sql");
const schedule = read("20261019090200_prospect_autopilot_schedule.sql");
const route = readFileSync(new URL("../routes/api/public/jobs/prospect-autopilot.ts", import.meta.url), "utf8");

describe("prospect autopilot migrations", () => {
  it("ships autopilot off, as a server-only singleton", () => {
    expect(tables).toMatch(/id integer PRIMARY KEY DEFAULT 1 CHECK \(id = 1\)/);
    expect(tables).toMatch(/enabled boolean NOT NULL DEFAULT false/);
    expect(tables).toMatch(/send_sms boolean NOT NULL DEFAULT false/);
    for (const table of ["prospect_autopilot_settings", "prospect_autopilot_runs"]) {
      expect(tables).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(tables).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it("keeps runs single-flight", () => {
    expect(tables).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS prospect_autopilot_runs_single_flight_idx[\s\S]*WHERE finished_at IS NULL/);
  });

  it("schedules autopilot at :17 and the site-engine backstop every 10 minutes, guarded", () => {
    expect(schedule).toContain("'revora-prospect-autopilot',\n    '17 * * * *'");
    expect(schedule).toContain("select public.call_revora_job('prospect-autopilot', 900000)");
    expect(schedule).toContain("'revora-site-engine-backstop',\n    '*/10 * * * *'");
    expect(schedule).toContain("select public.call_revora_job('site-engine', 900000)");
    expect(schedule).toContain("extname = 'pg_cron'");
    expect(schedule).toContain("p.proname = 'call_revora_job'");
  });

  it("adds rotation switched off with a server-only cursor table", () => {
    const rotation = read("20261019100100_prospect_rotation.sql");
    expect(rotation).toContain(`ADD COLUMN IF NOT EXISTS rotation jsonb NOT NULL\n    DEFAULT '{"enabled": false, "trades": [], "states": []}'::jsonb`);
    expect(rotation).toContain("CREATE TABLE IF NOT EXISTS public.prospect_rotation_cursor");
    expect(rotation).toContain("ALTER TABLE public.prospect_rotation_cursor ENABLE ROW LEVEL SECURITY;");
    expect(rotation).toContain("REVOKE ALL ON public.prospect_rotation_cursor FROM PUBLIC, anon, authenticated;");
  });

  it("keeps the side-effecting cron route POST-only and non-cacheable", () => {
    expect(route).toMatch(/^\s*POST:/m);
    // GET may only answer 405 Method Not Allowed; it must never run the job.
    const getHandlers = route.match(/^\s*GET:.*$/gm) ?? [];
    expect(getHandlers.map((line) => line.trim())).toEqual(["GET: () => methodNotAllowed(),"]);
    expect(route).toContain('headers.set("Cache-Control", "no-store")');
  });
});
