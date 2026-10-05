import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructuredOutput = vi.fn();
vi.mock("@/lib/ai/router.server", () => ({
  generateStructuredOutput: (...args: unknown[]) => generateStructuredOutput(...args),
}));

import { RevoraAiError } from "@/lib/ai/errors";
import { visionCapableModel, preferredVisionRank } from "@/lib/ai/vision-models";
import { toImageDataUrl } from "@/lib/ai/data-url";
import { partsOf } from "@/lib/ai/providers/openai-compatible";
import {
  VISUAL_REVIEW_TIMEOUT_MS,
  acceptedForUse,
  inspectPhoto,
  readVerdict,
  shouldReshoot,
} from "@/lib/ai/photo-direction.server";

const caller = { organizationId: "11111111-1111-4111-8111-111111111111", userId: null };
const RAW = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Issue 1: vision payload is always a valid data URL", () => {
  it("prefixes raw base64 with the mime type", () => {
    expect(toImageDataUrl(RAW, "image/png")).toBe(`data:image/png;base64,${RAW}`);
    expect(toImageDataUrl(RAW, "image/jpeg; charset=binary")).toBe(`data:image/jpeg;base64,${RAW}`);
    expect(toImageDataUrl(RAW, "")).toBe(`data:image/png;base64,${RAW}`);
  });

  it("keeps an existing data URL, strips whitespace and never double-prefixes", () => {
    const url = `data:image/webp;base64,${RAW}`;
    expect(toImageDataUrl(url, "image/png")).toBe(url);
    expect(toImageDataUrl(`data:image/webp;base64,${RAW.slice(0, 10)}\n ${RAW.slice(10)}`)).toBe(url);
  });

  it("passes remote URLs through untouched", () => {
    expect(toImageDataUrl("https://cdn.example.com/a.png", "image/png")).toBe("https://cdn.example.com/a.png");
  });

  it("serialises OpenAI-compatible image parts as data URLs", () => {
    const parts = partsOf("cloudflare", [
      { type: "text", text: "review" },
      { type: "image", dataUrl: RAW, mimeType: "image/png" },
    ]);
    expect(parts).toEqual([
      { type: "text", text: "review" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${RAW}` } },
    ]);
  });
});

describe("Issue 2: only verified vision models may review pictures", () => {
  it.each([
    "meta/llama-3.2-11b-vision-instruct",
    "@cf/meta/llama-3.2-11b-vision-instruct",
    "@cf/meta/llama-4-scout-17b-16e-instruct",
    "gemini-2.5-flash",
    "gemini-3.8-flash",
    "Qwen/Qwen2.5-VL-72B-Instruct",
    "inclusionai/ling-3.0-flash-vl:free",
    "gpt-4o",
  ])("accepts %s", (model) => {
    expect(visionCapableModel(model)).toBe(true);
  });

  it.each([
    "@cf/zai-org/glm-5.2",
    "@cf/openai/gpt-oss-120b",
    "nvidia/nemotron-3-super-120b-a12b",
    "@cf/qwen/qwen2.5-coder-32b-instruct",
    "@cf/meta/llama-3.2-3b-instruct",
    "deepseek-flash",
    "@cf/black-forest-labs/flux-1-schnell",
    "mistral-small-latest",
    "",
  ])("rejects %s", (model) => {
    expect(visionCapableModel(model)).toBe(false);
  });

  it("ranks NVIDIA NIM llama-3.2-11b-vision first, then Workers AI, then Gemini", () => {
    const nim = preferredVisionRank("nvidia", "meta/llama-3.2-11b-vision-instruct");
    const cf = preferredVisionRank("cloudflare", "@cf/meta/llama-3.2-11b-vision-instruct");
    const gemini = preferredVisionRank("google", "gemini-2.5-flash");
    expect(nim).toBeLessThan(cf);
    expect(cf).toBeLessThan(gemini);
    expect(preferredVisionRank("cloudflare", "@cf/zai-org/glm-5.2")).toBe(Number.POSITIVE_INFINITY);
  });

  it("asks the router for a fast-fail visual review", async () => {
    generateStructuredOutput.mockResolvedValueOnce({ data: { publishable: true, defects: [] } });
    await inspectPhoto({ base64: RAW, mimeType: "image/png" }, { prompt: "a clean bay" }, caller);
    const request = generateStructuredOutput.mock.calls.at(-1)?.[1] as {
      role: string;
      timeoutMs: number;
      messages: { content: unknown }[];
    };
    expect(request.role).toBe("vision");
    expect(request.timeoutMs).toBe(VISUAL_REVIEW_TIMEOUT_MS);
    expect(request.timeoutMs).toBeGreaterThanOrEqual(8_000);
    expect(request.timeoutMs).toBeLessThanOrEqual(10_000);
    const image = (request.messages[1]!.content as { type: string; dataUrl?: string }[]).find((p) => p.type === "image");
    expect(image?.dataUrl).toBe(`data:image/png;base64,${RAW}`);
  });
});

describe("Issue 3: review outages never trigger reshoots", () => {
  beforeEach(() => {
    generateStructuredOutput.mockReset();
    delete process.env["VISUAL_REVIEW_UNAVAILABLE_POLICY"];
  });

  it("retries the review once (no regeneration) and then reports reviewFailed", async () => {
    generateStructuredOutput
      .mockRejectedValueOnce(new RevoraAiError(408, "slow", { category: "timeout" }))
      .mockRejectedValueOnce(new RevoraAiError(503, "down", { category: "provider_unavailable" }));
    const verdict = await inspectPhoto({ base64: RAW, mimeType: "image/png" }, { prompt: "p" }, caller);
    expect(generateStructuredOutput).toHaveBeenCalledTimes(2);
    expect(verdict.reviewFailed).toBe(true);
    expect(verdict.contentRejected).toBe(false);
    expect(verdict.reviewed).toBe(false);
    expect(shouldReshoot(verdict)).toBe(false);
    expect(acceptedForUse(verdict)).toBe(true);
    expect(acceptedForUse(verdict, "reject")).toBe(false);
  });

  it("recovers when the single review retry succeeds", async () => {
    generateStructuredOutput
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ data: { publishable: true, defects: [] } });
    const verdict = await inspectPhoto({ base64: RAW, mimeType: "image/png" }, { prompt: "p" }, caller);
    expect(verdict.publishable).toBe(true);
    expect(verdict.reviewFailed).toBe(false);
  });

  it("only a genuine Terra rejection allows a reshoot", async () => {
    generateStructuredOutput
      .mockResolvedValueOnce({ data: { publishable: false, defects: ["warped wheel"], revisedPrompt: "" } })
      // Sol's targeted revision call.
      .mockResolvedValueOnce({ data: { prompt: "x".repeat(120) } });
    const verdict = await inspectPhoto({ base64: RAW, mimeType: "image/png" }, { prompt: "p" }, caller);
    expect(verdict.contentRejected).toBe(true);
    expect(verdict.reviewFailed).toBe(false);
    expect(shouldReshoot(verdict)).toBe(true);
    expect(acceptedForUse(verdict)).toBe(false);
  });

  it("readVerdict marks every Terra answer as a content judgement, never an outage", () => {
    expect(readVerdict({ publishable: true })).toMatchObject({ contentRejected: false, reviewFailed: false });
    expect(readVerdict({})).toMatchObject({ contentRejected: true, reviewFailed: false, reviewed: true });
  });
});

describe("Issue 2: router vision routing", async () => {
  // Real router helpers (the module-level mock above only replaces the
  // structured-output entry point used by photo-direction).
  const router = await vi.importActual<typeof import("@/lib/ai/router.server")>("@/lib/ai/router.server");

  it("forces the vision capability gate on the vision role only", () => {
    const gate = router.roleCapability("vision");
    expect(gate?.("@cf/zai-org/glm-5.2")).toBe(false);
    expect(gate?.("meta/llama-3.2-11b-vision-instruct")).toBe(true);
    expect(router.roleCapability("primary")).toBeUndefined();
    const custom = router.roleCapability("vision", (model) => !model.includes("scout"));
    expect(custom?.("@cf/meta/llama-4-scout-17b-16e-instruct")).toBe(false);
  });

  it("puts the fast free vision endpoints first without reordering paid models", () => {
    const ordered = router.fastVisionFirst([
      { free: null, model: "gpt-5.6-terra" },
      { free: "google", model: "gemini-3.8-flash" },
      { free: "cloudflare", model: "@cf/meta/llama-3.2-11b-vision-instruct" },
      { free: "nvidia", model: "meta/llama-3.2-11b-vision-instruct" },
      { free: "huggingface", model: "Qwen/Qwen2.5-VL-72B-Instruct" },
    ] as Parameters<typeof router.fastVisionFirst>[0]);
    expect(ordered.map((entry) => entry.model)).toEqual([
      "gpt-5.6-terra",
      "meta/llama-3.2-11b-vision-instruct",
      "@cf/meta/llama-3.2-11b-vision-instruct",
      "gemini-3.8-flash",
      "Qwen/Qwen2.5-VL-72B-Instruct",
    ]);
  });
});
