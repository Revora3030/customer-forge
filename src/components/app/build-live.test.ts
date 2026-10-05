/**
 * Regression tests for the "watch your site being built" surface:
 * - BuildLive is wired into the three places a new customer lands
 *   (post-checkout welcome, dashboard, portal setup steps).
 * - The build story is complete: every generation stage has a friendly
 *   live label so no stage ever shows raw keys or goes silent.
 * - The panel only reports real server-recorded progress (no fake stages).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATION_STEPS } from "@/lib/site-engine";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("BuildLive surface", () => {
  it("is mounted on the post-checkout welcome page", () => {
    const src = read("src/routes/_authenticated/app.welcome.tsx");
    expect(src).toContain('import { BuildLiveSection } from "@/components/app/BuildLive"');
    expect(src).toContain("<BuildLiveSection organizationId={orgId} />");
  });

  it("is mounted on the client portal setup steps", () => {
    const src = read("src/routes/_authenticated/my.start.tsx");
    expect(src).toContain('import { BuildLive } from "@/components/app/BuildLive"');
    expect(src).toContain("<BuildLive organizationId={orgId} />");
  });

  it("is mounted on the growth center dashboard", () => {
    const src = read("src/routes/_authenticated/app.index.tsx");
    expect(src).toContain('import { BuildLive } from "@/components/app/BuildLive"');
    expect(src).toContain("<BuildLive organizationId={orgId} />");
  });

  it("renders nothing when no build needs watching", () => {
    const src = read("src/components/app/BuildLive.tsx");
    expect(src).toContain("if (!active && !failed) return null;");
  });

  it("shows only real recorded progress — a live label plus the worker's own percent", () => {
    const src = read("src/components/app/BuildLive.tsx");
    // Progress comes from the job row the worker wrote, never a timer-based guess.
    expect(src).toContain("row?.progress");
    // Stages come from useBuildProgress (builder_progress + generation_jobs).
    expect(src).toContain("useBuildProgress(organizationId, active || failed)");
    // Escape hatch into the builder always exists.
    expect(src).toContain('to="/app/website"');
  });
});

describe("complete live build story", () => {
  it("every generation stage has a friendly live label in the worker", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    const labelsBlock = worker.match(/WORKER_STAGE_LABELS[^=]*=\s*\{([^}]*)\}/s);
    expect(labelsBlock, "WORKER_STAGE_LABELS record must exist").toBeTruthy();
    const labeled = new Set(
      [...labelsBlock![1]!.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]),
    );
    for (const step of GENERATION_STEPS) {
      expect(labeled.has(step.key), `stage "${step.key}" has no live label`).toBe(true);
    }
  });

  it("labels are customer-facing sentences, not machine keys", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    const labelsBlock = worker.match(/WORKER_STAGE_LABELS[^=]*=\s*\{([^}]*)\}/s)!;
    for (const [, , label] of labelsBlock[1]!.matchAll(/(\w+):\s*"([^"]+)"/g)) {
      expect(label!.length).toBeGreaterThan(10);
      expect(label).not.toMatch(/_/);
    }
  });
});
