import { describe, expect, it } from "vitest";
import { FACT_SAVE_FALLBACK, factSaveErrorMessage, submitFactAnswer } from "@/lib/builder/fact-answer";

describe("answering a missing-fact question", () => {
  it("saves a phone number like (919) 555-0142 exactly as typed", async () => {
    const saved: string[] = [];
    const outcome = await submitFactAnswer("  (919) 555-0142 ", async (value) => {
      saved.push(value);
    });
    expect(saved).toEqual(["(919) 555-0142"]);
    expect(outcome).toEqual({ ok: true, answer: "(919) 555-0142" });
  });

  it("turns a failed save into a visible error and keeps the answer", async () => {
    const outcome = await submitFactAnswer("(919) 555-0142", async () => {
      throw new Error("You don't have permission to do that in this workspace.");
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.answer).toBe("(919) 555-0142");
    expect(outcome.message).toMatch(/permission/i);
  });

  it("never throws, even for odd rejections", async () => {
    const outcome = await submitFactAnswer("x", () => Promise.reject(undefined));
    expect(outcome).toEqual({ ok: false, answer: "x", message: FACT_SAVE_FALLBACK });
  });

  it("does not call save for an empty answer", async () => {
    let called = false;
    const outcome = await submitFactAnswer("   ", async () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(outcome.ok).toBe(false);
  });

  it("uses safe copy for unknown errors", () => {
    expect(factSaveErrorMessage(null)).toBe(FACT_SAVE_FALLBACK);
  });
});
