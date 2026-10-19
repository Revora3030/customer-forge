import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";
import {
  buildSpendScope,
  demoBuildsAllowPaid,
  scopedFreeOnly,
  scopedFreeOnlyReason,
  withAiSpendScope,
} from "@/lib/ai/spend-scope.server";
import { reservePaidSpend } from "@/lib/ai/paid-budget.server";
import { paidImageStatus } from "@/lib/ai/paid-image.server";
import { callPinnedPaidImage } from "@/lib/ai/router.server";

const FREE = { freeOnly: true, reason: "demo_workspace" } as const;
const OPEN = { freeOnly: false, reason: null } as const;

beforeEach(() => {
  isolateProviderEnvironment();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI spending scope", () => {
  it("is open outside any scope and free-only inside a free-only one", async () => {
    expect(scopedFreeOnly()).toBe(false);
    await withAiSpendScope(FREE, async () => {
      await Promise.resolve();
      expect(scopedFreeOnly()).toBe(true);
      expect(scopedFreeOnlyReason()).toBe("demo_workspace");
    });
    expect(scopedFreeOnly()).toBe(false);
  });

  it("cannot be widened by a nested scope", async () => {
    await withAiSpendScope(FREE, () =>
      withAiSpendScope(OPEN, async () => {
        expect(scopedFreeOnly()).toBe(true);
      }),
    );
  });

  it("keeps concurrent runs apart (one process, several workspaces)", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    const trace = async (scope: typeof FREE | typeof OPEN, out: boolean[]) =>
      withAiSpendScope(scope, async () => {
        for (let i = 0; i < 5; i += 1) {
          out.push(scopedFreeOnly());
          await tick();
        }
      });
    const demo: boolean[] = [];
    const customer: boolean[] = [];
    await Promise.all([trace(FREE, demo), trace(OPEN, customer), trace(FREE, []), trace(OPEN, [])]);
    expect(demo).toEqual([true, true, true, true, true]);
    expect(customer).toEqual([false, false, false, false, false]);
  });
});

describe("paid gates inside a free-only scope", () => {
  it("refuses every paid reservation (the backstop for router, Luna, pictures and video)", async () => {
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "5");
    expect(await reservePaidSpend(1000)).not.toBeNull();
    expect(await withAiSpendScope(FREE, () => reservePaidSpend(1000))).toBeNull();
  });

  it("turns the premium picture lane off", () => {
    expect(withAiSpendScope(FREE, () => paidImageStatus())).toMatchObject({ allowed: false });
  });

  it("refuses a pinned paid picture call before any provider is reached", async () => {
    vi.stubEnv("OPENAI_API_KEY", "paid-openai");
    await expect(
      withAiSpendScope(FREE, () => callPinnedPaidImage({ userId: "u", task: "test" } as never, "a photo", "gpt-image-1")),
    ).rejects.toMatchObject({ name: "RevoraAiError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("build spending scope", () => {
  const db = (row: unknown, error: unknown = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }) }),
  });

  it("makes demo workspaces free-only by default", async () => {
    expect(await buildSpendScope(db({ is_demo: true }), "org")).toEqual({ freeOnly: true, reason: "demo_workspace" });
    expect(await buildSpendScope(db({ is_demo: false }), "org")).toEqual({ freeOnly: false, reason: null });
  });

  it("lets the owner opt demo builds into paid", async () => {
    vi.stubEnv("DEMO_BUILDS_ALLOW_PAID", "true");
    expect(demoBuildsAllowPaid()).toBe(true);
    expect(await buildSpendScope(db({ is_demo: true }), "org")).toEqual({ freeOnly: false, reason: null });
    expect(demoBuildsAllowPaid({ DEMO_BUILDS_ALLOW_PAID: "maybe" })).toBe(false);
  });

  it("fails closed (free-only) when the workspace can't be read", async () => {
    expect(await buildSpendScope(db(null), "org")).toMatchObject({ freeOnly: true });
    expect(await buildSpendScope(db(null, { message: "down" }), "org")).toMatchObject({ freeOnly: true });
    const throwing = { from: () => { throw new Error("boom"); } };
    expect(await buildSpendScope(throwing as never, "org")).toMatchObject({ freeOnly: true });
  });
});
