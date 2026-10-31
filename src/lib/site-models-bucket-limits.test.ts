import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_MODEL_BYTES, MODEL_BUCKET, MODEL_MIME } from "./site-models";

describe("3D model bucket limits", () => {
  const sql = readFileSync("supabase/migrations/20261031180000_site_models_bucket_limits.sql", "utf8");
  it("is private, glb-only and capped at the app's size limit", () => {
    expect(sql).toContain(`'${MODEL_BUCKET}'`);
    expect(sql).toContain(`ARRAY['${MODEL_MIME}']`);
    expect(sql).toContain(String(MAX_MODEL_BYTES));
    expect(sql).toContain("public = false");
    expect(sql).toContain("lower(storage.extension(name)) = 'glb'");
    expect(sql).not.toMatch(/gltf\+json|'gltf'/);
  });
});
