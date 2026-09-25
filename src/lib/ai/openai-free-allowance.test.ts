/**
 * OpenAI's shared-traffic daily allowance as a FREE lane.
 *
 * The allowance covers a named set of models only; every other OpenAI model is
 * billed. These tests pin that boundary, so no billed model can ever enter a
 * free-only chain and the allowance models stay reachable when paid credit is
 * exhausted.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  freeProviderChain,
  freeProviderCredentials,
  freeProviderOrder,
  isFreeEligibleModel,
  openAiSharedTrafficFree,
  resetFreeBudget,
} from "@/lib/ai/free";

const KEYS = ["OPENAI_API_KEY", "OPENAI_FREE_TIER_SHARING", "FREE_AI_PROVIDER_ORDER", "FREE_AI_ENABLED"];

describe("OpenAI shared-traffic free allowance", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of KEYS) saved.set(key, process.env[key]);
    for (const key of KEYS) delete process.env[key];
    resetFreeBudget();
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetFreeBudget();
  });

  it("admits only the models OpenAI names in the allowance", () => {
    for (const model of ["gpt-5.4", "gpt-5.4-mini", "gpt-4o-mini", "o3-mini", "o4-mini", "o3"])
      expect(isFreeEligibleModel("openai", model)).toBe(true);
  });

  it("rejects every billed OpenAI model", () => {
    for (const model of [
      "gpt-6-sol",
      "gpt-6-astra",
      "gpt-5.6-terra",
      "gpt-5.5-pro",
      "gpt-image-2.5-sunburst",
      "sora-2",
      "whisper-1",
    ]) {
      expect(isFreeEligibleModel("openai", model)).toBe(false);
      expect(openAiSharedTrafficFree(model)).toBe(false);
    }
  });

  it("needs the OpenAI key and treats sharing=false as no free lane", () => {
    expect(freeProviderCredentials("openai")).toBeNull();
    process.env["OPENAI_API_KEY"] = "test-key";
    expect(freeProviderCredentials("openai")?.apiKey).toBe("test-key");
    process.env["OPENAI_FREE_TIER_SHARING"] = "false";
    expect(freeProviderCredentials("openai")).toBeNull();
  });

  it("joins the free chain with an allowance model, ahead of the other free providers", () => {
    process.env["OPENAI_API_KEY"] = "test-key";
    expect(freeProviderOrder()[0]).toBe("openai");
    const chain = freeProviderChain("fast");
    const entry = chain.find((candidate) => candidate.name === "openai");
    expect(entry).toBeDefined();
    expect(openAiSharedTrafficFree(entry!.model)).toBe(true);
  });

  it("offers no picture or transcription role: the allowance does not cover them", () => {
    process.env["OPENAI_API_KEY"] = "test-key";
    for (const role of ["image", "transcription"] as const)
      expect(freeProviderChain(role).some((entry) => entry.name === "openai")).toBe(false);
  });
});
