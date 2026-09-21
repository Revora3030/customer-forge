import { describe, expect, it, vi } from "vitest";

/**
 * Every on-screen message must speak with one voice: one place decides how
 * long each kind stays up, and feature code never talks to the toast library
 * directly.
 */

type Recorded = { kind: string; message: string; opts?: Record<string, unknown> | undefined };

const calls: Recorded[] = [];

vi.mock("sonner", () => {
  const record =
    (kind: string) =>
    (message: string, opts?: Record<string, unknown>): string => {
      calls.push({ kind, message, opts });
      return `${kind}-id`;
    };
  const base = Object.assign(record("default"), {
    success: record("success"),
    error: record("error"),
    warning: record("warning"),
    info: record("info"),
    loading: record("loading"),
    dismiss: (id?: string) => calls.push({ kind: "dismiss", message: String(id ?? "") }),
  });
  return { toast: base };
});

const { notify, toast, NOTIFY_DURATION } = await import("./notify");

describe("one message vocabulary", () => {
  it("gives every kind the shared duration", () => {
    calls.length = 0;
    notify.done("Saved.");
    notify.info("Nothing to do.");
    notify.warn("Check this.");
    notify.fail("That failed.");
    notify.working("Working…");
    expect(calls.map((c) => [c.kind, c.opts?.["duration"]])).toEqual([
      ["success", NOTIFY_DURATION.done],
      ["default", NOTIFY_DURATION.info],
      ["warning", NOTIFY_DURATION.warn],
      ["error", NOTIFY_DURATION.fail],
      ["loading", NOTIFY_DURATION.working],
    ]);
  });

  it("keeps failures on screen longer than confirmations", () => {
    expect(NOTIFY_DURATION.fail).toBeGreaterThan(NOTIFY_DURATION.done);
    expect(NOTIFY_DURATION.warn).toBeGreaterThan(NOTIFY_DURATION.done);
  });

  it("carries the same durations through the compatibility surface", () => {
    calls.length = 0;
    toast.success("Saved.");
    toast.error("Failed.");
    toast("Note.");
    expect(calls.map((c) => c.opts?.["duration"])).toEqual([
      NOTIFY_DURATION.done,
      NOTIFY_DURATION.fail,
      NOTIFY_DURATION.info,
    ]);
  });

  it("lets a caller override the duration deliberately", () => {
    calls.length = 0;
    toast.success("Saved.", { duration: 100 });
    expect(calls[0]?.opts?.["duration"]).toBe(100);
  });

  it("passes a description through untouched", () => {
    calls.length = 0;
    notify.fail("Could not publish.", { description: "Fix the two checks first." });
    expect(calls[0]?.opts?.["description"]).toBe("Fix the two checks first.");
  });
});
