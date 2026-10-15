import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015210000_jarvis_acquisition_studio.sql", import.meta.url),
  "utf8",
);

describe("Jarvis acquisition studio migration contract", () => {
  it("keeps all acquisition records inaccessible to browser roles", () => {
    for (const table of [
      "jarvis_acquisition_prospects",
      "jarvis_acquisition_sites",
      "jarvis_acquisition_interests",
      "jarvis_acquisition_events",
    ]) {
      expect(migration).toMatch(new RegExp("ALTER TABLE public\\\\." + table + " ENABLE ROW LEVEL SECURITY", "i"));
      expect(migration).toMatch(new RegExp("REVOKE ALL ON public\\\\." + table + " FROM PUBLIC, anon, authenticated", "i"));
    }
  });

  it("stores only token hashes and expiring provider fields", () => {
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    expect(migration).toContain("source_data_expires_at timestamptz NOT NULL");
    expect(migration).toContain("google_place_id text NOT NULL UNIQUE");
  });

  it("requires live preview and an atomic rate limit before recording interest", () => {
    expect(migration).toContain("s.status = 'active' AND s.expires_at > now()");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(p_site_id::text))");
    expect(migration).toContain("v_recent >= 5");
  });

  it("protects the audit log against updates and deletes", () => {
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON public.jarvis_acquisition_events");
    expect(migration).toContain("Jarvis acquisition events are append-only.");
    expect(migration).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.jarvis_acquisition_events/i);
  });

  it("does not expose the interest RPC to anon or authenticated roles", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.jarvis_acquisition_submit_interest\(uuid,text,text,text,text\)\s+FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.jarvis_acquisition_submit_interest\(uuid,text,text,text,text\)\s+TO service_role/i);
  });
});
