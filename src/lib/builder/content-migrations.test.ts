import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mediaBackfill = readFileSync("supabase/migrations/20261018090100_media_source_backfill.sql", "utf8");
const fontDefault = readFileSync("supabase/migrations/20261018090200_drop_font_preference_default.sql", "utf8");
/** SQL without comments, so assertions read the statements only. */
const statements = (sql: string) => sql.replace(/--.*$/gm, "");

describe("content migrations", () => {
  it("marks only null-source AI file names as generated, and moves AI pictures out of 'work'", () => {
    const sql = statements(mediaBackfill);
    expect(sql).toMatch(/SET source = 'generated'\s+WHERE source IS NULL\s+AND \(file_name ILIKE 'ai-%' OR file_name ILIKE 'revora-image%'\)/);
    expect(sql).toMatch(/SET category = 'other'\s+WHERE source IN \('generated', 'ai'\)\s+AND category = 'work'/);
  });

  it("drops the platform font default and clears it only for unpublished, non-demo workspaces", () => {
    const sql = statements(fontDefault);
    expect(sql).toMatch(/ALTER TABLE public\.business_profiles ALTER COLUMN font_preference DROP DEFAULT/);
    expect(sql).toMatch(/font_preference = 'Space Grotesk'/);
    expect(sql).toMatch(/organization_id <> '11111111-1111-4111-8111-111111111111'/);
    expect(sql).toMatch(/NOT EXISTS \([\s\S]*website_settings ws[\s\S]*ws\.published = true/);
  });

  it("deletes nothing and stays additive", () => {
    for (const sql of [mediaBackfill, fontDefault].map(statements)) {
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    }
  });
});
