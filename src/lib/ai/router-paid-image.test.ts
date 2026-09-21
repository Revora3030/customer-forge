import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openAiImage = vi.fn();
const reserveBudget = vi.fn();
const settleBudget = vi.fn();
const recordUsage = vi.fn();
const recordAiEvent = vi.fn();

vi.mock("@/lib/ai/providers/openai", () => ({
  openAiAdapter: {
    name: "openai",
    chat: vi.fn(),
    stream: vi.fn(),
    image: openAiImage,
    transcribe: vi.fn(),
  },
}));

vi.mock("@/lib/ai/luna.server", () => ({
  reserveBudget,
  settleBudget,
  recordUsage,
}));

vi.mock("@/lib/ai/telemetry.server", () => ({
  checkAiLimits: vi.fn(async () => ({ allowed: true })),
  recordAiEvent,
}));

const KEYS = [
  "ZERO_AI_COST_MODE",
  "BUILDER_EXTERNAL_AI_ALLOWED",
  "FREE_AI_ONLY",
  "OPENAI_API_KEY",
  "AI_OPENAI_MODEL_IMAGE",
  "PAID_IMAGE_ESTIMATE_MICROCENTS",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.clearAllMocks();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
});

function enablePaidImage() {
  process.env["ZERO_AI_COST_MODE"] = "false";
  process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
  process.env["FREE_AI_ONLY"] = "false";
  process.env["OPENAI_API_KEY"] = "test-openai-key";
}

describe("paid first-build image fallback", () => {
  it("is unavailable by default and names the zero-cost blocker", async () => {
    const { paidImageFallbackStatus, generatePaidImageFallback } = await import(
      "@/lib/ai/router.server"
    );
    const status = paidImageFallbackStatus();
    expect(status).toMatchObject({ available: false, reason: "ZERO_AI_COST_MODE" });
    await expect(generatePaidImageFallback({ task: "image.generate" }, "brief")).rejects.toMatchObject({
      category: "zero_cost_mode",
    });
    expect(openAiImage).not.toHaveBeenCalled();
  });

  it("requires the exact gpt-image-2 fallback model", async () => {
    enablePaidImage();
    process.env["AI_OPENAI_MODEL_IMAGE"] = "gpt-image-1";
    const { paidImageFallbackStatus } = await import("@/lib/ai/router.server");
    expect(paidImageFallbackStatus()).toMatchObject({
      available: false,
      reason: "AI_OPENAI_MODEL_IMAGE",
      model: "gpt-image-1",
    });
  });

  it("uses the durable budget before calling gpt-image-2 and settles the estimate", async () => {
    enablePaidImage();
    process.env["PAID_IMAGE_ESTIMATE_MICROCENTS"] = "12345";
    reserveBudget.mockResolvedValue({ allowed: true, spent: 0, cap: 2_000_000_000, calls: 1, tenantSpent: 0, tenantCap: 2_000_000_000 });
    openAiImage.mockResolvedValue({ base64: "A".repeat(1500), mimeType: "image/png" });
    const { generatePaidImageFallback } = await import("@/lib/ai/router.server");
    const result = await generatePaidImageFallback(
      { task: "image.generate", organizationId: "org-1", userId: "user-1" },
      "premium hero brief",
    );
    expect(reserveBudget).toHaveBeenCalledWith(12345, "org-1");
    expect(openAiImage).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-openai-key", model: "gpt-image-2", prompt: "premium hero brief" }),
    );
    expect(settleBudget).toHaveBeenCalledWith("org-1", 12345, 12345);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: "succeeded", model: "gpt-image-2" }));
    expect(recordAiEvent).toHaveBeenCalledWith(expect.objectContaining({ ok: true, fallbackUsed: true }));
    expect(result).toMatchObject({ provider: "openai", model: "gpt-image-2", fallbackUsed: true });
  });

  it("does not call the provider when the monthly cap is reached", async () => {
    enablePaidImage();
    reserveBudget.mockResolvedValue({ allowed: false, spent: 2_000_000_000, cap: 2_000_000_000, calls: 9, tenantSpent: 2_000_000_000, tenantCap: 2_000_000_000 });
    const { generatePaidImageFallback } = await import("@/lib/ai/router.server");
    await expect(
      generatePaidImageFallback({ task: "image.generate", organizationId: "org-1" }, "brief"),
    ).rejects.toMatchObject({ status: 402, category: "quota" });
    expect(openAiImage).not.toHaveBeenCalled();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped" }));
  });
});