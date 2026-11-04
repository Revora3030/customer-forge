import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), "supabase/migrations");
const FILE = "20261104210000_cron_jobs_every_15m.sql";
const migration = readFileSync(resolve(DIR, FILE), "utf8");
const sql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const JOBS = [
  ["revora-site-engine-backstop", "20261019090200_prospect_autopilot_schedule.sql"],
  ["revora-prospect-replies", "20261019100000_prospect_gmail_replies.sql"],
  ["revora-automation-runs", "20261030120000_customer_jobs_schedule.sql"],
] as const;

describe("10-minute cron jobs to 15-minute reschedule migration", () => {
  it("is timestamped after the migrations it reschedules", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(FILE > "20261104200000").toBe(true);
    for (const [, source] of JOBS) {
      expect(files).toContain(source);
      expect(FILE > source).toBe(true);
    }
  });

  it("contains no DROP, unschedule, or row changes", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/cron\.unschedule/i);
    expect(sql).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\.|DELETE\s+FROM)\b/i);
  });

  it("is a no-op when pg_cron, cron.job, or a job is missing", () => {
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).toContain("to_regclass('cron.job') IS NULL");
    expect(sql).toContain("WHERE jobname = v_job_name");
    expect(sql).toMatch(/IF v_job_id IS NULL THEN[\s\S]*?CONTINUE;/);
  });

  it("reschedules each job to every 15 minutes via cron.alter_job only", () => {
    for (const [job] of JOBS) expect(sql).toContain(`'${job}'`);
    expect(sql).toContain("cron.alter_job(job_id := v_job_id, schedule := '*/15 * * * *')");
    const schedules = sql.match(/'\*\/\d+ \* \* \* \*'/g) ?? [];
    expect(schedules).toEqual(["'*/15 * * * *'"]);
    expect(sql).not.toMatch(/cron\.schedule\s*\(/i);
  });
});
