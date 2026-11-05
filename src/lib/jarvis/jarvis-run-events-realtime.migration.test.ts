import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261105140000_jarvis_run_events_realtime.sql", import.meta.url),
  "utf8",
);

describe("JC-32 jarvis_run_events realtime migration", () => {
  it("idempotently adds jarvis_run_events to supabase_realtime", () => {
    expect(migration).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.jarvis_run_events/);
    expect(migration).toMatch(/WHEN duplicate_object THEN NULL/);
  });

  it("flags Manager review and keeps polling as the offline fallback story", () => {
    expect(migration).toMatch(/MANAGER REVIEW REQUIRED/i);
    expect(migration).toMatch(/polling fallback/i);
  });
});
