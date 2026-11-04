import { describe, expect, it } from "vitest";
import { RevoraAiError, notConfigured } from "@/lib/ai/errors";
import { providerHttpError } from "@/lib/ai/providers/shared";
import { aiErrorCategoryOf, executiveFallback } from "./jarvis-executive-fallback";

describe("executive fallback", () => {
  it("answers from finished checks when every model fails", () => {
    const text = executiveFallback({ ran: ["Builder health"], reason: "quota" });
    expect(text).toContain("Builder health");
    expect(text).toContain("quota");
    expect(text).not.toContain("no eligible AI model could finish");
    expect(text).not.toMatch(/\$\d/);
  });

  it("keeps the generic retry guidance when the failure has no known category", () => {
    const text = executiveFallback({ ran: [], reason: "The model roster did not finish.", error: new Error("socket hang up") });
    expect(text).toContain("retry this message");
    expect(text).toContain("AI City");
  });

  it("says out of credits, and never retry, for quota", () => {
    const error = new RevoraAiError(402, "Revora's AI provider is out of credits right now. Waiting work resumes once credits are topped up.", { category: "quota" });
    const text = executiveFallback({ ran: ["Builder health"], reason: error.message, error });
    expect(text).toContain("Revora AI is out of credits; replies resume once credits are topped up");
    expect(text).not.toMatch(/retry/i);
    expect(text).not.toMatch(/try again/i);
  });

  it("says busy, try again in a moment, for rate limits", () => {
    const text = executiveFallback({ ran: [], reason: "Revora AI is busy right now.", category: "rate_limited" });
    expect(text).toContain("Revora AI is busy right now. Try again in a moment.");
    expect(text).not.toContain("out of credits");
  });

  it("tells the owner an admin must set up AI when it is not configured", () => {
    const error = notConfigured();
    const text = executiveFallback({ ran: [], reason: error.message, error });
    expect(text).toContain("An admin needs to add Revora's AI provider");
    expect(text).not.toMatch(/retry|try again/i);
  });

  it("says it took too long, try again, for timeouts", () => {
    const text = executiveFallback({ ran: [], reason: "Revora AI took too long to answer.", category: "timeout" });
    expect(text).toContain("Revora AI took too long to answer. Try again");
  });

  it("never echoes anything that looks like a key", () => {
    const text = executiveFallback({ ran: [], reason: "upstream said Authorization: Bearer abc.def.ghi with sk-live_1234567890abcdef and api_key=AIzaSecretValue", category: "quota" });
    expect(text).not.toContain("abc.def.ghi");
    expect(text).not.toContain("sk-live_1234567890abcdef");
    expect(text).not.toContain("AIzaSecretValue");
    expect(text).toContain("[redacted]");
  });

  it("reads only real Revora categories off an error", () => {
    expect(aiErrorCategoryOf(new RevoraAiError(429, "busy", { category: "rate_limited" }))).toBe("rate_limited");
    expect(aiErrorCategoryOf({ category: "toString" })).toBeNull();
    expect(aiErrorCategoryOf(new Error("plain"))).toBeNull();
    expect(aiErrorCategoryOf(null)).toBeNull();
  });
});

describe("provider HTTP errors for credits and rate limits", () => {
  it("402 says credits are exhausted, without provider text", async () => {
    const error = await providerHttpError("lovable", new Response('{"error":"Payment required: key sk-secret-abcdef123456"}', { status: 402 }));
    expect(error.category).toBe("quota");
    expect(error.message).toBe("Revora's AI provider (lovable) is out of credits. Replies resume once credits are topped up.");
    expect(error.message).not.toContain("sk-secret");
    expect(error.retryable).toBe(false);
  });

  it("429 says busy, try again in a moment", async () => {
    const error = await providerHttpError("lovable", new Response("slow down", { status: 429, headers: { "retry-after": "7" } }));
    expect(error.category).toBe("rate_limited");
    expect(error.message).toBe("Revora AI is busy right now. Try again in a moment.");
    expect(error.retryAfterSeconds).toBe(7);
    expect(error.retryable).toBe(true);
  });

  it("403 policy refusals keep the provider-account wording", async () => {
    const error = await providerHttpError("lovable", new Response("forbidden", { status: 403 }));
    expect(error.category).toBe("policy");
    expect(error.message).toContain("refused this request");
  });
});
