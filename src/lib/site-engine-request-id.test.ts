import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRunRequestId } from "@/lib/site-engine.functions";
import {
  classifySiteMediaRow,
  isPlatformDefaultFont,
  readJobRequestId,
} from "@/lib/site-engine.worker.server";

const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
const functions = readFileSync("src/lib/site-engine.functions.ts", "utf8");

function selectDb(result: { data: unknown; error: { code?: string; message: string } | null }) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
  };
  return { from: () => query } as never;
}

describe("worker progress uses the chat request id (2.3)", () => {
  it("never records worker stages under the job id directly", () => {
    expect(worker).not.toContain("noteStage(orgId, job.id");
    expect(worker).not.toMatch(/recordStage\([^)]*job\.id/);
    expect(worker).toContain("const runId = requestId ?? job.id;");
  });

  it("step() announces the stage that is starting, not the one that finished", () => {
    const step = worker.slice(worker.indexOf("const step = async (key: string)"), worker.indexOf("const [org, profile"));
    expect(step).toContain("GENERATION_STEPS.findIndex((s) => s.key === key) + 1");
    expect(step).not.toContain("WORKER_STAGE_LABELS[key]");
  });

  it("runSiteGeneration validates the request id and stores it on the job", () => {
    expect(parseRunRequestId(undefined)).toBeNull();
    expect(parseRunRequestId("")).toBeNull();
    expect(parseRunRequestId("t123abc")).toBe("t123abc");
    expect(parseRunRequestId("t123~r9")).toBe("t123_r9");
    expect(() => parseRunRequestId("bad id!")).toThrow("Invalid request id");
    expect(() => parseRunRequestId("ab")).toThrow("Invalid request id");
    expect(functions).toContain("const requestId = parseRunRequestId(input?.requestId);");
    expect(functions).toContain("request_id: data.requestId");
    expect(functions).toContain("requestId: data.requestId,");
  });

  it("readJobRequestId tolerates the column not being migrated yet", async () => {
    expect(
      await readJobRequestId(selectDb({ data: null, error: { code: "42703", message: 'column "request_id" does not exist' } }), "job"),
    ).toBeNull();
    expect(await readJobRequestId(selectDb({ data: null, error: { code: "PGRST204", message: "missing" } }), "job")).toBeNull();
    expect(await readJobRequestId(selectDb({ data: { request_id: "tmvbrv48y2" }, error: null }), "job")).toBe("tmvbrv48y2");
    expect(await readJobRequestId(selectDb({ data: { request_id: "bad id!" }, error: null }), "job")).toBeNull();
    expect(await readJobRequestId(selectDb({ data: { request_id: null }, error: null }), "job")).toBeNull();
  });
});

describe("media provenance for placement (1.1b)", () => {
  it("classifies owner, generated, stock and skipped rows", () => {
    expect(classifySiteMediaRow({ source: null, file_name: "ai-x.png", url: "a/b.png" })).toBe("generated");
    expect(classifySiteMediaRow({ source: null, file_name: "revora-image-1.png", url: "a/b.png" })).toBe("generated");
    expect(classifySiteMediaRow({ source: "generated", file_name: "first-build-hero.png", url: "a/b.png" })).toBe("generated");
    expect(classifySiteMediaRow({ source: "ai", file_name: "x.png", url: "a/b.png" })).toBe("generated");
    expect(classifySiteMediaRow({ source: "stock:openverse", file_name: "x.jpg", url: "a/b.jpg" })).toBe("stock");
    expect(classifySiteMediaRow({ source: "owner", file_name: "ai-named-by-owner.jpg", url: "a/b.jpg" })).toBe("owner");
    expect(classifySiteMediaRow({ source: null, file_name: "IMG_0001.jpg", url: "a/b.jpg" })).toBe("owner");
    expect(classifySiteMediaRow({ source: null, category: "logo", url: "a/logo.png" })).toBe("skip");
    expect(classifySiteMediaRow({ source: null, url: "a/clip.mp4" })).toBe("skip");
    expect(classifySiteMediaRow({ source: null, url: null })).toBe("skip");
  });

  it("withholds owner photos without a description and never uses the file name", () => {
    expect(worker).toContain("const ownerRows = describedOnly(ownerCandidates);");
    expect(worker).toContain("of your photos need a short description before they can go on your site (Media Library)");
    expect(worker).not.toMatch(/row\.alt_text \|\| row\.file_name/);
    expect(worker).toContain('placement: ["services", "about", "story"]');
    expect(worker).toContain('provider: "stock"');
  });
});

describe("platform default font is not an owner request (1.2)", () => {
  it("recognises only the bare seeded default", () => {
    expect(isPlatformDefaultFont("Space Grotesk")).toBe(true);
    expect(isPlatformDefaultFont("  Space Grotesk ")).toBe(true);
    expect(isPlatformDefaultFont("Space Grotesk|DM Sans")).toBe(false);
    expect(isPlatformDefaultFont("Fraunces")).toBe(false);
    expect(isPlatformDefaultFont(null)).toBe(false);
    expect(isPlatformDefaultFont(undefined)).toBe(false);
  });

  it("is ignored for the identity request, the effective font and the owner-brand check", () => {
    expect(worker).toContain('requestedFont: isPlatformDefaultFont(p["font_preference"]) ? null');
    expect(worker).toMatch(/const effectiveFont =[\s\S]{0,120}!isPlatformDefaultFont\(p\["font_preference"\]\)/);
    expect(worker).toMatch(/const hasOwnerBrand = Boolean\(\s*\(\(p\["font_preference"\] as string\) && !isPlatformDefaultFont/);
  });
});
