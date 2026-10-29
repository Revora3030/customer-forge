import { describe, expect, it } from "vitest";
import { chatRosterExtras } from "./router.server";
import { REVIEW_AREA_MODELS } from "@/lib/builder/review-panel.server";

const models = {
  primary: "anthropic/claude-sonnet-5,openai/gpt-6.1-sol,google/gemini-4-argon",
  design: "openai/gpt-6.1-sol,anthropic/claude-opus-5-5,anthropic/claude-fable-5-1,google/gemini-3.1-pro-preview",
  fast: "google/gemini-3.1-flash-lite,anthropic/claude-haiku-4-5",
  vision: "google/gemini-3.8-flash",
  image: "openai/gpt-image-2",
  transcription: "openai/gpt-transcribe",
  conversation: "anthropic/claude-sonnet-5",
  coding: "openai/gpt-6.1-sol",
};

describe("reviewer model preferences", () => {
  it("pulls a preferred chat model from another roster and leaves image models alone", () => {
    expect(chatRosterExtras(models, "primary", ["anthropic/claude-haiku-4-5"])).toEqual(["anthropic/claude-haiku-4-5"]);
    expect(chatRosterExtras(models, "primary", ["anthropic/claude-opus-5-5", "anthropic/claude-fable-5-1"])).toEqual([
      "anthropic/claude-opus-5-5",
      "anthropic/claude-fable-5-1",
    ]);
    expect(chatRosterExtras(models, "primary", ["google/gemini-3.1-pro-preview"])).toEqual(["google/gemini-3.1-pro-preview"]);
    expect(chatRosterExtras(models, "primary", ["anthropic/claude-sonnet-5"])).toEqual([]);
    expect(chatRosterExtras(models, "primary", ["openai/gpt-image-2"])).toEqual([]);
  });

  it("covers the review areas whose first model is not on the primary roster", async () => {
    process.env["LOVABLE_API_KEY"] ||= "fixture";
    const { providerConfig } = await import("./config");
    const configured = providerConfig()!.models;
    const primary = new Set(configured.primary.split(",").map((id) => id.trim()));
    const missed = ["accessibility", "senior", "whole_site", "funnel"] as const;
    for (const area of missed) {
      const lead = REVIEW_AREA_MODELS[area]?.[0];
      expect(lead, area).toBeTruthy();
      expect(primary.has(lead!), area).toBe(false);
      expect(chatRosterExtras(configured, "primary", REVIEW_AREA_MODELS[area]), area).toContain(lead);
    }
  });
});
