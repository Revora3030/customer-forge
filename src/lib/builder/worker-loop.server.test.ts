import { describe, expect, it, vi } from "vitest";
import { runBuildWorkerLoop, workerPollInterval } from "./worker-loop.server";

describe("independent generation worker loop", () => {
  it("validates polling configuration", () => {
    expect(workerPollInterval(undefined)).toBe(2000);
    expect(workerPollInterval("1000")).toBe(1000);
    for (const value of ["0", "-1", "NaN", "Infinity", "1000.5", "60001"]) {
      expect(() => workerPollInterval(value)).toThrow();
    }
  });
  it("does not start new work after shutdown", async () => {
    const drain = vi.fn();
    await runBuildWorkerLoop({ drain, shouldStop: () => true, sleep: vi.fn(), onError: vi.fn() });
    expect(drain).not.toHaveBeenCalled();
  });
  it("awaits the active build before starting another drain", async () => {
    let stop = false;
    let release: () => void = () => {};
    const work = new Promise<void>((resolve) => { release = resolve; });
    const drain = vi.fn(async () => { await work; stop = true; });
    const running = runBuildWorkerLoop({ drain, shouldStop: () => stop, sleep: vi.fn(), onError: vi.fn() });
    await Promise.resolve();
    expect(drain).toHaveBeenCalledTimes(1);
    release();
    await running;
    expect(drain).toHaveBeenCalledTimes(1);
  });
  it("backs off on errors and resets after a healthy drain", async () => {
    let calls = 0;
    let sleeps = 0;
    let stop = false;
    const delays: number[] = [];
    const onError = vi.fn();
    await runBuildWorkerLoop({
      drain: async () => { if (++calls <= 2) throw new Error("temporary failure"); },
      shouldStop: () => stop,
      sleep: async (delay) => { delays.push(delay); if (++sleeps === 3) stop = true; },
      onError,
    });
    expect(delays).toEqual([5000, 10000, 2000]);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
