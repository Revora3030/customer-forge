import { afterEach, describe, expect, it, vi } from "vitest";
import { openAiAdapter } from "./providers/openai";
import { callPinnedPaidImage } from "./router.server";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("pinned image deadlines", () => {
  it("aborts a stuck adapter and releases the workspace slot", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "1000");
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const adapter = vi.spyOn(openAiAdapter, "image").mockImplementation(async input => {
      signal = input.signal;
      return new Promise(() => undefined); // Deliberately ignores abort.
    });
    const pending = callPinnedPaidImage({ organizationId: "timeout-test", task: "test" }, "A photo", "test-model");
    const assertion = expect(pending).rejects.toMatchObject({ category: "timeout", status: 408 });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(signal?.aborted).toBe(true);
    adapter.mockResolvedValue({ base64: "AAAA", mimeType: "image/png" });
    await expect(callPinnedPaidImage({ organizationId: "timeout-test", task: "test" }, "Another photo", "test-model"))
      .resolves.toMatchObject({ base64: "AAAA" });
  });
});

describe("paid picture provider order", () => {
  it("sends paid pictures to Lovable first with the vendor-prefixed model id", async () => {
    const { lovableAdapter } = await import("./providers/lovable");
    vi.stubEnv("LOVABLE_API_KEY", "test-lovable");
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    const lovable = vi.spyOn(lovableAdapter, "image").mockResolvedValue({ base64: "BBBB", mimeType: "image/png" });
    const openai = vi.spyOn(openAiAdapter, "image");
    const result = await callPinnedPaidImage({ organizationId: "order-test", task: "test" }, "A photo", "gpt-image-2.5-sunburst");
    expect(result).toMatchObject({ provider: "lovable", model: "openai/gpt-image-2.5-sunburst" });
    expect(lovable).toHaveBeenCalledOnce();
    expect(openai).not.toHaveBeenCalled();
  });
});
