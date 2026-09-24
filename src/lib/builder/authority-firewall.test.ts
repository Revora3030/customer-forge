import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { blankDesignFingerprint } from "./design-fingerprint";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}
const production = files("src");

describe("creative authority firewall", () => {
  it("no production code imports the template gallery or archetype recipes", () => {
    const offenders = production.filter((f) => {
      if (f.endsWith("template-gallery.ts") || f.endsWith("site-archetypes.ts")) return false;
      return /from ["'][^"']*(template-gallery|site-archetypes)["']/.test(readFileSync(f, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("deleted rule-based creative modules stay deleted", () => {
    const gone = [
      "src/lib/site-archetypes.ts",
      "src/lib/visual-palette.ts",
      "src/lib/builder/template-gallery.ts",
      "src/lib/builder/conversion-blueprint.ts",
      "src/lib/builder/site-conversion-architecture.ts",
      "src/lib/builder/sitewide-cta.ts",
      "src/lib/builder/copy-depth.ts",
    ];
    const present = gone.filter((f) => {
      try {
        statSync(f);
        return true;
      } catch {
        return false;
      }
    });
    expect(present).toEqual([]);
  });

  it("a cut-off model answer is a failure that hands over, never a partial plan", () => {
    const src = readFileSync("src/lib/ai/luna.server.ts", "utf8");
    expect(src).toMatch(/readFinishReason\(payload\) === "length"/);
    const thinker = readFileSync("src/lib/ai/hall-of-fame.server.ts", "utf8");
    const body = thinker.slice(thinker.indexOf("export async function callBestThinker"));
    // The only fallback after the paid lane is the free model squad.
    expect(body).toContain("callHallOfFame(");
    expect(body).not.toMatch(/fingerprint|archetype|template|preset/i);
  });

  it("the fingerprint can no longer pick designs from finite pools", () => {
    const neutral = blankDesignFingerprint();
    const a = blankDesignFingerprint();
    const b = blankDesignFingerprint();
    for (const fp of [a, b]) {
      expect({ ...fp, id: neutral.id, seed: neutral.seed, rejected: neutral.rejected }).toEqual(neutral);
    }
  });
});

describe("upgrade rule passes", () => {
  it("no rule-based motion or story pass exists; Motion goes through the AI redesign", async () => {
    const src = readFileSync("src/lib/site-upgrade.functions.ts", "utf8");
    expect(src).not.toMatch(/applyMotionPack|applyStoryPass|motion-pack|story-pass/);
    const panel = readFileSync("src/components/app/SiteUpgradePanel.tsx", "utf8");
    expect(panel).toMatch(/applySiteWideRedesign\(\{ data: \{ organizationId, instruction: ask \} \}\)/);
    const redesign = src.slice(src.indexOf("export const applySiteWideRedesign"), src.indexOf("export const reviewPageScreenshot"));
    expect(redesign).not.toMatch(/planMotionAssignments\(/);
  });
});

describe("first build", () => {
  it("never consumes industry page/section recipes or conversion placements", () => {
    for (const f of [
      "src/lib/site-engine.worker.server.ts",
      "src/lib/builder/collective-first-build.server.ts",
      "src/lib/builder/native-first-build.ts",
      "src/lib/builder/first-build-images.server.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/industry\.homeSections|industry\.pageSlugs|conversion\.placements/);
    }
  });
});

describe("request understanding and design fallbacks", () => {
  it("the keyword intent translator is gone from production", () => {
    const offenders = production.filter((f) => /intent-translator|translateIntent\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no-model design fallback carries no layout, type, palette or story opinion", async () => {
    const { designWithoutModel } = await import("@/lib/agent/design-brief.server");
    for (const trade of ["plumbing", "dental", "wedding photography", null]) {
      const d = designWithoutModel(trade);
      expect([d.goal, d.layout, d.typography, d.palette, d.motion]).toEqual(["", "", "", "", ""]);
      expect(d.story).toEqual([]);
    }
  });

  it("no-model understanding passes the owner's words through unchanged", async () => {
    const { understandWithoutModel } = await import("@/lib/agent/understanding.server");
    const u = understandWithoutModel("make it feel like a moody jazz club");
    expect(u.goal).toBe("make it feel like a moody jazz club");
    expect(u.tasks[0]?.brief).toBe("make it feel like a moody jazz club");
  });
});
