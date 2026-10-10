import { afterEach, describe, expect, it, vi } from "vitest";
import { runInBackground, withExecutionContext } from "./background";

afterEach(() => vi.restoreAllMocks());

describe("request-scoped background context", () => {
  it("registers overlapping requests with their own waitUntil", async () => {
    const a: Promise<unknown>[] = [], b: Promise<unknown>[] = [];
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const first = withExecutionContext({ waitUntil: (p: Promise<unknown>) => a.push(p) }, async () => {
      await barrier;
      runInBackground(async () => "tenant-a");
    });
    await withExecutionContext({ waitUntil: (p: Promise<unknown>) => b.push(p) }, async () => {
      runInBackground(async () => "tenant-b");
      release();
    });
    await first;
    expect(await Promise.all(a)).toEqual(["tenant-a"]);
    expect(await Promise.all(b)).toEqual(["tenant-b"]);
  });

  it("catches synchronous and asynchronous failures without leaking a context", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tasks: Promise<unknown>[] = [];
    withExecutionContext({ waitUntil: (p: Promise<unknown>) => tasks.push(p) }, () => {
      runInBackground(() => { throw new Error("sync"); });
      runInBackground(async () => { throw new Error("async"); });
    });
    await Promise.all(tasks);
    expect(warn).toHaveBeenCalledTimes(2);
    runInBackground(async () => "outside");
    expect(tasks).toHaveLength(2);
  });
});
