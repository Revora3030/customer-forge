import { describe, expect, it } from "vitest";

describe("Jarvis prospect-to-preview acquisition contract", () => {
  it("keeps prospect records private and bounds durable acquisition jobs", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("supabase/migrations/20261015193000_jarvis_prospect_to_preview.sql", "utf8");
    expect(sql).toContain("ALTER TABLE public.jarvis_prospects ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.jarvis_prospects FROM anon, authenticated");
    expect(sql).toContain("'no_website_listed'");
    expect(sql).toContain("'preview_ready'");
    expect(sql).toContain("idempotency_key text NOT NULL UNIQUE");
    expect(sql).toContain("attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 5)");
  });

  it("requires super-admin authority and keeps discovery separate from external actions", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/lib/jarvis-acquisition.functions.ts", "utf8");
    expect(source).toContain("assertSuperAdmin");
    expect(source).toContain("GOOGLE_MAPS_API_KEY");
    expect(source).toContain("verificationRequired: true");
    expect(source).toContain("noExternalContact: true");
    expect(source).toContain("noPublishing: true");
    expect(source).not.toContain("createGrowthSystemCheckout(");
    expect(source).not.toContain("publishWebsite(");
  });
});
