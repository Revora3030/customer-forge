import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), "supabase/migrations");
const FILE = "20261104200000_lead_delivery_watchdog_every_15m.sql";
const migration = readFileSync(resolve(DIR, FILE), "utf8");
const sql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("lead delivery watchdog 15-minute reschedule migration", () => {
  it("is timestamped after the watchdog migration it reschedules", () => {
    expect(FILE > "20261101010000").toBe(true);
    expect(readdirSync(DIR)).toContain("20261101010000_lead_delivery_watchdog.sql");
  });

  it("contains no DROP, unschedule, or row changes", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/cron\.unschedule/i);
    expect(sql).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\.|DELETE\s+FROM)\b/i);
  });

  it("is a no-op when pg_cron, cron.job, or the job is missing", () => {
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).toContain("to_regclass('cron.job') IS NULL");
    expect(sql).toContain("jobname = 'revora-lead-delivery-watchdog'");
    expect(sql).toMatch(/IF v_job_id IS NULL THEN[\s\S]*?RETURN;/);
  });

  it("reschedules only the watchdog job to every 15 minutes via cron.alter_job", () => {
    expect(sql).toContain("cron.alter_job(job_id := v_job_id, schedule := '*/15 * * * *')");
    const schedules = sql.match(/'\*\/\d+ \* \* \* \*'/g) ?? [];
    expect(schedules).toEqual(["'*/15 * * * *'"]);
    expect(sql).not.toMatch(/cron\.schedule\s*\(/i);
  });
});
