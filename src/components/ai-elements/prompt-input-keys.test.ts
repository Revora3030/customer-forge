import { describe, expect, it } from "vitest";
import { enterKeyAction, IME_PROCESS_KEY_CODE, isOwnFormSubmit } from "@/components/ai-elements/prompt-input-keys";

describe("composer Enter key", () => {
  it("sends on Enter", () => {
    expect(enterKeyAction({ key: "Enter" })).toBe("submit");
    expect(enterKeyAction({ key: "Enter", keyCode: 13 })).toBe("submit");
  });

  it("adds a new line on Shift+Enter (and Alt+Enter)", () => {
    expect(enterKeyAction({ key: "Enter", shiftKey: true })).toBe("newline");
    expect(enterKeyAction({ key: "Enter", altKey: true })).toBe("newline");
  });

  it("never sends while an IME is composing", () => {
    expect(enterKeyAction({ key: "Enter", composing: true })).toBe("ignore");
    expect(enterKeyAction({ key: "Enter", nativeComposing: true })).toBe("ignore");
    // Safari: the candidate-confirming Enter arrives as keyCode 229.
    expect(enterKeyAction({ key: "Enter", keyCode: IME_PROCESS_KEY_CODE })).toBe("ignore");
    expect(enterKeyAction({ key: "Enter", shiftKey: true, composing: true })).toBe("ignore");
  });

  it("ignores every other key, so typing never sends", () => {
    for (const key of ["a", "m", " ", "Backspace", "Tab", "Process"]) {
      expect(enterKeyAction({ key })).toBe("ignore");
    }
  });
});

describe("composer submit source", () => {
  it("accepts only the composer's own form", () => {
    const form = {} as EventTarget;
    const dialogForm = {} as EventTarget;
    expect(isOwnFormSubmit(form, form)).toBe(true);
    expect(isOwnFormSubmit(dialogForm, form)).toBe(false);
    expect(isOwnFormSubmit(null, form)).toBe(false);
  });
});
