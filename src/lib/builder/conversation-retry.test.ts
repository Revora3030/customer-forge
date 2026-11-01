import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/router.server", () => ({ generateStructuredOutput: generate }));
vi.mock("./conversation-inspection.server", () => ({ inspectConversation: () => "" }));
vi.mock("./ai-retry", async (importOriginal) => ({ ...(await importOriginal<typeof import("./ai-retry")>()), RETRY_BACKOFF_MS: 0 }));

import { decideConversation } from "./conversation.server";

const input = {
  organizationId: "o", userId: "u", instruction: "what do you think of my homepage?", history: [], hasAttachments: false,
  business: { name: "Acme", industry: "plumbing" }, pages: [], firstBuildActive: false, siteDetail: "",
} as never;

class ProviderError extends Error { category = "provider_unavailable"; }

describe("decideConversation retry", () => {
  beforeEach(() => { generate.mockReset(); });

  it("retries once after a transient failure and uses the second answer", async () => {
    generate.mockImplementationOnce(async () => { throw new ProviderError("busy"); }).mockImplementationOnce(async () => ({ data: { mode: "answer", reply: "Looks good." } }));
    await expect(decideConversation(input)).resolves.toEqual({ mode: "answer", reply: "Looks good." });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable (not a fake answer) when both attempts fail", async () => {
    generate.mockImplementation(async () => { throw new ProviderError("busy"); });
    const decision = await decideConversation(input);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(decision.mode).toBe("unavailable");
  });

  it("does not retry a failure that cannot succeed", async () => {
    generate.mockImplementation(async () => { throw Object.assign(new Error("no key"), { category: "unauthorized" }); });
    const decision = await decideConversation(input);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(decision.mode).toBe("unavailable");
  });
});
