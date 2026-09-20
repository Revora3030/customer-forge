import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  freeImageBudgetAllows,
  freeImageBudgetRemaining,
  imageEditCapableModel,
  isFreeEligibleModel,
  noteFreeUse,
  resetFreeBudget,
} from "@/lib/ai/free";
import { resetFreeModelDiscovery } from "@/lib/ai/free-models.server";
import { imageGenerationCapability } from "@/lib/media/image-capability.server";
import { planMedia, resolveMediaSources } from "@/lib/media/provider-registry";

const KEYS = [
  "FREE_AI_ENABLED",
  "FREE_AI_IMAGE_DAILY_CAP",
  "CLOUDFLARE_AI_API_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetFreeBudget();
  resetFreeModelDiscovery();
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetFreeBudget();
  resetFreeModelDiscovery();
});

describe("free image eligibility gate", () => {
  it("accepts the verified free Cloudflare text-to-image model", () => {
    expect(isFreeEligibleModel("cloudflare", "@cf/black-forest-labs/flux-1-schnell")).toBe(true);
  });

  it("rejects billed and partner image models whatever the role", () => {
    expect(isFreeEligibleModel("cloudflare", "@cf/black-forest-labs/flux-2-klein-9b")).toBe(false);
    expect(isFreeEligibleModel("cloudflare", "@cf/leonardo/phoenix-1.0")).toBe(false);
    expect(isFreeEligibleModel("cloudflare", "gpt-image-1")).toBe(false);
  });

  it("only treats image-to-image models as edit capable", () => {
    expect(imageEditCapableModel("@cf/black-forest-labs/flux-1-schnell")).toBe(false);
    expect(imageEditCapableModel("@cf/runwayml/stable-diffusion-v1-5-img2img")).toBe(true);
    expect(imageEditCapableModel("@cf/runwayml/stable-diffusion-v1-5-inpainting")).toBe(true);
  });
});

describe("daily free picture allowance", () => {
  it("counts picture calls separately and stops at the cap", () => {
    process.env["FREE_AI_IMAGE_DAILY_CAP"] = "2";
    expect(freeImageBudgetRemaining("cloudflare")).toBe(2);
    noteFreeUse("cloudflare", "image");
    noteFreeUse("cloudflare", "image");
    expect(freeImageBudgetAllows("cloudflare")).toBe(false);
  });

  it("does not spend the picture allowance on text calls", () => {
    process.env["FREE_AI_IMAGE_DAILY_CAP"] = "1";
    noteFreeUse("cloudflare");
    expect(freeImageBudgetAllows("cloudflare")).toBe(true);
  });
});

describe("image capability report", () => {
  it("reports unavailable with a reason when no credentials are present", async () => {
    const capability = await imageGenerationCapability();
    expect(capability.available).toBe(false);
    expect(capability.code).toBe("IMAGE_GENERATION_UNAVAILABLE");
    expect(capability.reason).toBe("no_provider_configured");
    expect(capability.providers).toEqual([]);
  });

  it("reports unavailable when free AI is switched off", async () => {
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "account";
    const capability = await imageGenerationCapability();
    expect(capability.reason).toBe("free_ai_disabled");
  });

  it("reports the daily allowance as spent rather than generating", async () => {
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "account";
    process.env["FREE_AI_IMAGE_DAILY_CAP"] = "1";
    noteFreeUse("cloudflare", "image");
    const capability = await imageGenerationCapability();
    expect(capability.available).toBe(false);
    expect(capability.reason).toBe("daily_allowance_spent");
    expect(capability.message).toMatch(/nothing was charged/i);
  });

  it("never leaks a credential value into the owner-facing message", async () => {
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "super-secret-token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "account";
    const capability = await imageGenerationCapability();
    expect(JSON.stringify(capability)).not.toContain("super-secret-token");
  });
});

describe("media source registry reflects live generation state", () => {
  it("marks AI generation available when a free provider is genuinely ready", () => {
    const sources = resolveMediaSources({
      ownerAssetCount: 0,
      presentSecrets: [],
      aiGeneration: { state: "available", reason: "Free picture making is available." },
    });
    const ai = sources.find((source) => source.id === "ai_generation")!;
    expect(ai.state).toBe("available");
    expect(ai.zeroCost).toBe(true);
  });

  it("falls back to generated artwork when generation is unavailable", () => {
    const plan = planMedia({
      ownerAssetCount: 0,
      presentSecrets: [],
      aiGeneration: { state: "not_configured", reason: "No free picture service is connected." },
    });
    expect(plan.usesGeneratedArt).toBe(true);
    expect(plan.source.id).toBe("generated_art");
  });

  it("prefers real generated photography over abstract artwork when available", () => {
    const plan = planMedia({
      ownerAssetCount: 0,
      presentSecrets: [],
      aiGeneration: { state: "available", reason: "ready" },
    });
    expect(plan.source.id).toBe("ai_generation");
    expect(plan.usesGeneratedArt).toBe(false);
  });

  it("still refuses to invent a real photograph of the business", () => {
    const plan = planMedia(
      {
        ownerAssetCount: 0,
        presentSecrets: [],
        aiGeneration: { state: "available", reason: "ready" },
      },
      { mustBeReal: true },
    );
    expect(plan.usesGeneratedArt).toBe(false);
    expect(plan.source.id).not.toBe("ai_generation");
  });
});
