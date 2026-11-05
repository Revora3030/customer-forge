/**
 * JC-63: vitest coverage for bundle budget helpers (fixtures only — no build required).
 * Post-build enforcement runs via scripts/perf-budgets.mjs from client-bundle-guard.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const contract = join(root, "scripts", "perf-budgets.contract.mjs");
const script = join(root, "scripts", "perf-budgets.mjs");
const budgetsPath = join(root, "scripts", "perf-budgets.json");

describe("JC-63 perf budgets", () => {
  it("contract script passes", () => {
    const r = spawnSync(process.execPath, [contract], { encoding: "utf8" });
    expect(r.status, r.stderr || r.stdout).toBe(0);
  });

  it("budgets JSON is measured + ~10% headroom (no invented zeros)", () => {
    const cfg = JSON.parse(readFileSync(budgetsPath, "utf8"));
    expect(cfg.budgets.length).toBeGreaterThanOrEqual(4);
    for (const b of cfg.budgets) {
      expect(b.maxBytes).toBeGreaterThan(0);
      expect(b.measuredBytes).toBeGreaterThan(0);
      expect(b.maxBytes).toBeGreaterThanOrEqual(b.measuredBytes);
      const ratio = b.maxBytes / b.measuredBytes;
      expect(ratio).toBeGreaterThanOrEqual(1.05);
      expect(ratio).toBeLessThanOrEqual(1.15);
    }
    const ids = cfg.budgets.map((b: { id: string }) => b.id);
    expect(ids).toContain("city-scene-chunk-gzip");
    expect(ids).toContain("total-js-gzip");
  });

  it("fails when a required city chunk is over budget", () => {
    const dir = mkdtempSync(join(tmpdir(), "jc63-over-"));
    const assets = join(dir, "assets");
    mkdirSync(assets);
    // Incompressible payload so gzip ≈ raw and exceeds city-scene maxBytes (~25KB).
    writeFileSync(join(assets, "CityScene-big.js"), randomBytes(80_000));
    writeFileSync(join(assets, "admin.city-big.js"), randomBytes(1_000));
    writeFileSync(join(assets, "tiny.css"), "c{}");
    const r = spawnSync(process.execPath, [script, assets], {
      encoding: "utf8",
      cwd: root,
    });
    rmSync(dir, { recursive: true, force: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/city-scene-chunk-gzip|budget exceeded/i);
  });
});
