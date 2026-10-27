import { afterEach, describe, expect, it, vi } from "vitest";

const { drain, durable } = vi.hoisted(() => ({
  drain: vi.fn(async (..._args: unknown[]) => ({ processed: 0, failed: 0, paused: false, pauseReason: null, idle: false, handedBack: 1 })),
  durable: vi.fn(async (_organizationId: string) => false),
}));

vi.mock("@/lib/builder/durable-worker-kick.server", () => ({ requestDurableWorkerRun: durable }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/site-engine.worker.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/site-engine.worker.server")>()),
  drainSiteEngineQueue: drain,
}));

import { kickWorker } from "@/lib/site-engine.functions";
import { KICK_SLICE_BUDGET_MS } from "@/lib/site-engine.worker.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  drain.mockClear();
  durable.mockClear();
});

describe("the in-process kick fallback", () => {
  it("runs at most a short first slice instead of a whole build", async () => {
    vi.stubEnv("LOVABLE_CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await kickWorker("https://revoragrowthsystems.com", "1b332c6c-1c8d-4b84-a66d-e0efd0ca0571");
    expect(durable).toHaveBeenCalledOnce();
    // Without the cron secret there is no HTTP kick.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(drain).toHaveBeenCalledOnce();
    expect(drain).toHaveBeenCalledWith(expect.anything(), {
      max: 1,
      organizationId: "1b332c6c-1c8d-4b84-a66d-e0efd0ca0571",
      invoker: "kick",
      sliceBudgetMs: KICK_SLICE_BUDGET_MS,
    });
  });

  it("does not drain in-process when the database-held worker call was accepted", async () => {
    durable.mockResolvedValueOnce(true);
    await kickWorker("https://revoragrowthsystems.com", "1b332c6c-1c8d-4b84-a66d-e0efd0ca0571");
    expect(drain).not.toHaveBeenCalled();
  });
});
