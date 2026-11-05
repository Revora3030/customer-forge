import { describe, expect, it, vi } from "vitest";
import { isTurnStopped, stoppable } from "./stop-turn";

describe("Stop on a Jarvis turn", () => {
  it("rejects as stopped as soon as Stop is pressed and passes the signal to the request", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const pending = stoppable((signal) => { seen = signal; return new Promise<string>(() => undefined); }, controller);
    controller.abort();
    const error = await pending.catch((reason: unknown) => reason);
    expect(isTurnStopped(error)).toBe(true);
    expect(seen?.aborted).toBe(true);
  });

  it("ignores a result that arrives after Stop", async () => {
    const controller = new AbortController();
    let finish: (value: string) => void = () => undefined;
    const onValue = vi.fn();
    const pending = stoppable(() => new Promise<string>((resolve) => { finish = resolve; }), controller).then(onValue, (error: unknown) => error);
    controller.abort();
    finish("late reply");
    expect(isTurnStopped(await pending)).toBe(true);
    expect(onValue).not.toHaveBeenCalled();
  });

  it("passes real results and real errors through", async () => {
    await expect(stoppable(async () => "reply", new AbortController())).resolves.toBe("reply");
    const failure = await stoppable(async () => { throw new Error("Couldn't save your message."); }, new AbortController()).catch((error: unknown) => error);
    expect(isTurnStopped(failure)).toBe(false);
    expect((failure as Error).message).toBe("Couldn't save your message.");
  });
});
