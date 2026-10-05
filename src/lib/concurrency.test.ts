import { describe, expect, it } from "vitest";
import { createBackoffGate, mapConcurrent } from "@/lib/concurrency";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapConcurrent", () => {
  it("never runs more than `limit` tasks at once and keeps input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapConcurrent([50, 10, 30, 20, 40, 5, 15], 3, async (ms, index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick(ms);
      inFlight -= 1;
      return index;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("is much faster than serial for slow I/O", async () => {
    const started = Date.now();
    await mapConcurrent(Array.from({ length: 8 }, () => 40), 4, async (ms) => tick(ms));
    // Serial would be ~320ms; 4 lanes is ~80ms.
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("handles empty input and clamps silly limits", async () => {
    expect(await mapConcurrent([], 4, async () => 1)).toEqual([]);
    expect(await mapConcurrent([1, 2], 0, async (n) => n * 2)).toEqual([2, 4]);
  });

  it("surfaces a thrown task after in-flight work settles", async () => {
    await expect(
      mapConcurrent([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("createBackoffGate", () => {
  it("makes every waiter pause once any worker trips it", async () => {
    let now = 0;
    const slept: number[] = [];
    const gate = createBackoffGate(
      () => now,
      async (ms) => {
        slept.push(ms);
        now += ms;
      },
    );
    await gate.wait();
    expect(slept).toEqual([]);
    gate.trip(4000);
    expect(gate.remaining()).toBe(4000);
    await gate.wait();
    expect(slept).toEqual([4000]);
    expect(gate.remaining()).toBe(0);
  });

  it("only ever extends, never shortens, the shared window", () => {
    let now = 1000;
    const gate = createBackoffGate(() => now, async () => undefined);
    gate.trip(8000);
    gate.trip(2000);
    expect(gate.remaining()).toBe(8000);
    now += 3000;
    expect(gate.remaining()).toBe(5000);
  });
});
