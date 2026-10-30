import { afterEach, describe, expect, it, vi } from "vitest";
import { startConfirmationPolling } from "./checkout-confirmation";

afterEach(() => vi.useRealTimers());
describe("payment confirmation polling", () => {
  it("refreshes pending server state every three seconds and stops after two minutes", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const timeout = vi.fn();
    startConfirmationPolling(refresh, timeout);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(117000);
    expect(timeout).toHaveBeenCalledTimes(1);
    const calls = refresh.mock.calls.length;
    vi.advanceTimersByTime(9000);
    expect(refresh).toHaveBeenCalledTimes(calls);
  });
  it("stops all refreshes and timeout notices on confirmation or unmount", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const timeout = vi.fn();
    const stop = startConfirmationPolling(refresh, timeout);
    stop();
    vi.advanceTimersByTime(123000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(timeout).not.toHaveBeenCalled();
  });
});