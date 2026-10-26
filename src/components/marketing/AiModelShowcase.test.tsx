import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiModelShowcase } from "./AiModelShowcase";
import { LOVABLE_CONVERSATION_MODELS } from "@/lib/ai/lovable-models";

describe("homepage AI model showcase", () => {
  it("shows the specialist model options that exist in the browser-safe roster", () => {
    const markup = renderToStaticMarkup(<AiModelShowcase />);

    for (const model of [
      "openai/gpt-6.1-sol",
      "openai/gpt-6-sol",
      "openai/gpt-5.6-terra",
      "anthropic/claude-opus-5-5",
      "openai/gpt-5.6-luna",
      "openai/gpt-6-luna",
      "openai/gpt-6-astra",
      "anthropic/claude-sonnet-5",
      "google/gemini-3.8-flash",
    ]) {
      expect(LOVABLE_CONVERSATION_MODELS).toContain(model);
      expect(markup).toContain(model);
    }
  });

  it("keeps model filtering accessible and qualifies live availability", () => {
    const markup = renderToStaticMarkup(<AiModelShowcase />);

    expect(markup).toContain('aria-label="Filter AI specialist cards"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("44-Model Collective Orchestration");
    expect(markup).toContain("current catalogue eligibility");
    expect(markup).not.toContain("$750");
  });

  it("offers all requested specialist filters", () => {
    const markup = renderToStaticMarkup(<AiModelShowcase />);

    expect(markup).toContain("All Models");
    expect(markup).toContain("Creative Authority (Sol)");
    expect(markup).toContain("Structural QA (Terra)");
    expect(markup).toContain("Conversion &amp; SEO (Luna)");
    expect(markup).toContain("High-Throughput Bench");
  });
});
