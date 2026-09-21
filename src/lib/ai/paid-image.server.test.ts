import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { model: string; hasSource: boolean }[] = [];
const usage: { outcome: string; reason: string | null; model?: string }[] = [];
let reservationAllowed = true;
let modelReachable = { available: true, detail: "available on this account" };

vi.mock("@/lib/ai/router.server", () => ({
  paidImageModelReachable: vi.fn(async () => modelReachable),
  callPinnedPaidImage: vi.fn(
    async (
      _caller: unknown,
      _prompt: string,
      model: string,
      source: { dataUrl: string } | null = null,
    ) => {
      calls.push({ model, hasSource: Boolean(source) });
      return {
        base64: btoa("\u00ff\u00d8\u00ff".padEnd(4096, "x")),
        mimeType: "image/jpeg",
        provider: "openai" as const,
        model,
      };
    },
  ),
}));

vi.mock("@/lib/ai/luna.server", () => ({
  MICROCENTS_PER_DOLLAR: 1_000_000,
  formatUsd: (value: number) => `$${(value / 1_000_000).toFixed(2)}`,
  lunaEnabled: () => (process.env["LUNA_ENABLED"] ?? "").toLowerCase() === "true",
  lunaMonthlyCapMicrocents: () => 20_000_000,
  reserveBudget: vi.fn(async () => ({
    allowed: reservationAllowed,
    spent: 0,
    cap: 20_000_000,
  })),
  settleBudget: vi.fn(async () => undefined),
  recordUsage: vi.fn(async (row: { outcome: string; reason: string | null; model?: string }) => {
    usage.push(row);
  }),
}));

const ENV_KEYS = [
  "PAID_IMAGE_ENABLED",
  "LUNA_ENABLED",
  "OPENAI_API_KEY",
  "ZERO_AI_COST_MODE",
  "BUILDER_EXTERNAL_AI_ALLOWED",
];
const saved = new Map<string, string | undefined>();

async function paidImage() {
  const mod = await import("./paid-image.server");
  mod.resetPaidImageCapability();
  return mod;
}

beforeEach(() => {
  calls.length = 0;
  usage.length = 0;
  reservationAllowed = true;
  modelReachable = { available: true, detail: "available on this account" };
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  process.env["PAID_IMAGE_ENABLED"] = "true";
  process.env["LUNA_ENABLED"] = "true";
  process.env["OPENAI_API_KEY"] = "test-key";
  // Model availability is probed, never assumed.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("premium picture lane", () => {
  it("sends the hero frame to Sunburst and supporting photos to Flare", async () => {
    const { generatePaidImageBase64 } = await paidImage();
    const hero = await generatePaidImageBase64("cinematic vehicle hero", { organizationId: "org" }, "hero_master");
    const support = await generatePaidImageBase64("ceramic coating macro", { organizationId: "org" }, "service_photo");
    expect(hero.ok && hero.model).toBe("gpt-image-2.5-sunburst");
    expect(hero.ok && hero.tier).toBe("sunburst");
    expect(support.ok && support.model).toBe("gpt-image-2.5-flare");
    expect(calls.map((entry) => entry.model)).toEqual([
      "gpt-image-2.5-sunburst",
      "gpt-image-2.5-flare",
    ]);
  });

  it("changes an existing picture through Sunburst, passing the original", async () => {
    const { editPaidImage } = await paidImage();
    const result = await editPaidImage(
      "same photo, warmer light",
      { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
      { organizationId: "org" },
    );
    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual({ model: "gpt-image-2.5-sunburst", hasSource: true });
  });

  it("refuses a change with no original instead of inventing one", async () => {
    const { generatePaidImage } = await paidImage();
    const result = await generatePaidImage({ prompt: "warmer", purpose: "precision_edit" }, { organizationId: "org" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("unsupported_job");
    expect(calls).toHaveLength(0);
  });

  it("never calls a paid model when the paid lane is switched off", async () => {
    delete process.env["PAID_IMAGE_ENABLED"];
    const { generatePaidImageBase64 } = await paidImage();
    const result = await generatePaidImageBase64("anything", { organizationId: "org" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("stops at the hard monthly cap without topping up or charging extra", async () => {
    reservationAllowed = false;
    const { generatePaidImageBase64 } = await paidImage();
    const result = await generatePaidImageBase64("hero", { organizationId: "org" }, "hero_master");
    expect(result.ok === false && result.reason).toBe("budget_exhausted");
    expect(calls).toHaveLength(0);
    expect(usage.at(-1)).toMatchObject({ outcome: "skipped", reason: "budget_exhausted" });
  });

  it("reports a model the account cannot reach as a blocker, not a fallback", async () => {
    modelReachable = {
      available: false,
      detail: "this account does not have access to the model yet",
    };
    const { generatePaidImageBase64, paidImageCapability } = await paidImage();
    const result = await generatePaidImageBase64("hero", { organizationId: "org" }, "hero_master");
    expect(result.ok === false && result.reason).toBe("model_unavailable");
    expect(calls).toHaveLength(0);
    const capability = await paidImageCapability();
    expect(capability.available).toBe(false);
    expect(capability.tiers.map((tier) => tier.model)).toEqual([
      "gpt-image-2.5-sunburst",
      "gpt-image-2.5-flare",
    ]);
  });

  it("drops a damaged picture rather than attaching it to a website", async () => {
    const router = await import("@/lib/ai/router.server");
    vi.mocked(router.callPinnedPaidImage).mockResolvedValueOnce({
      base64: "AAAA",
      mimeType: "image/png",
      provider: "openai",
      model: "gpt-image-2.5-flare",
    });
    const { generatePaidImageBase64 } = await paidImage();
    const result = await generatePaidImageBase64("supporting photo", { organizationId: "org" });
    expect(result.ok === false && result.reason).toBe("invalid_image");
    expect(usage.at(-1)).toMatchObject({ outcome: "failed", reason: "invalid_image" });
  });
});
