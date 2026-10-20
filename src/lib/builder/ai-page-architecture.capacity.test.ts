import { beforeEach, describe, expect, it, vi } from "vitest";

const thinker = vi.fn();
vi.mock("@/lib/ai/hall-of-fame.server", () => ({ callBestThinker: (...args: unknown[]) => thinker(...args) }));

import { proposePageArchitecture } from "@/lib/builder/ai-page-architecture.server";
import { deriveCandidateArchitecture } from "@/lib/builder/ai-page-architecture";

const candidate = deriveCandidateArchitecture(
  [{ slug: "home", title: "Home", kind: "home", sections: [{ kind: "hero" }, { kind: "cta" }] }],
  "Book",
);
const input = { organizationId: "org", businessName: "Acme", industry: null, conversionGoal: null, candidate };

describe("page plan failures caused by a busy AI team wait instead of failing", () => {
  beforeEach(() => thinker.mockReset());

  it("marks an unreachable architect as a capacity wait", async () => {
    thinker.mockResolvedValue({ ok: false, reason: "rate_limited", detail: "all free models busy" });
    const outcome = await proposePageArchitecture(input);
    expect(outcome.architecture).toBeNull();
    expect(outcome.capacity).toBe(true);
  });

  it("marks an unusable (malformed) plan as a capacity wait", async () => {
    thinker.mockResolvedValue({ ok: true, text: "not json", model: "m", costMicrocents: 0 });
    const outcome = await proposePageArchitecture(input);
    expect(outcome.architecture).toBeNull();
    expect(outcome.capacity).toBe(true);
  });
});
