/**
 * iPhone builder chat: keyboard, 375px header, stray "…", long planning.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { keyboardState, KEYBOARD_MIN_INSET } from "./use-keyboard-inset";
import { PLAN_HARD_TIMEOUT_MS, PLAN_SLOW_HINT_MS, planIsSlow, withDeadline } from "@/lib/builder/plan-deadline";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const css = read("../builder-workspace.css");
const assistant = read("../BuilderAssistant.tsx");
const hooks = read("../../../lib/builder-requests.hooks.ts");

describe("keyboard inset (iOS visualViewport)", () => {
  const phone = { innerHeight: 844, innerWidth: 390, vvOffsetTop: 0 };

  it("opens only when typing in the chat with a real keyboard inset on a phone", () => {
    expect(keyboardState({ ...phone, vvHeight: 500, typingInChat: true })).toMatchObject({ open: true, inset: 344, height: 500, top: 0 });
    expect(keyboardState({ ...phone, vvHeight: 500, typingInChat: false }).open).toBe(false);
    expect(keyboardState({ ...phone, innerWidth: 1280, vvHeight: 500, typingInChat: true }).open).toBe(false);
    // URL-bar settling is not a keyboard.
    expect(keyboardState({ ...phone, vvHeight: 844 - (KEYBOARD_MIN_INSET - 1), typingInChat: true }).open).toBe(false);
  });

  it("accounts for iOS scrolling the page under the keyboard", () => {
    const s = keyboardState({ ...phone, vvHeight: 500, vvOffsetTop: 120, typingInChat: true });
    expect(s).toMatchObject({ top: 120, height: 500, inset: 224, open: true });
  });

  it("never reports a negative inset (Android resizes the layout viewport)", () => {
    expect(keyboardState({ ...phone, innerHeight: 500, vvHeight: 500, typingInChat: true })).toMatchObject({ inset: 0, open: false });
  });

  it("pins the chat to the visible area while the keyboard is open, with vh/svh fallbacks", () => {
    expect(css).toMatch(/\[data-builder-keyboard="open"\] #website-assistant \{[^}]*position: fixed;[^}]*top: var\(--builder-vv-top[^}]*height: var\(--builder-vv-height/);
    expect(css).toContain("calc(100vh - var(--builder-chat-top");
    expect(css).toContain("calc(100svh - var(--builder-chat-top");
    expect(assistant).toContain("useKeyboardInset(sectionRef)");
    expect(assistant).not.toMatch(/\b100vh\b/);
    expect(assistant).toMatch(/<Conversation className="min-h-0 flex-1/);
  });
});

describe("chat header at 375px", () => {
  it("keeps title and status on one truncated line and controls unshrunk", () => {
    expect(css).toMatch(/#website-assistant > header :is\(h1, h2, h3, p\) \{[^}]*min-width: 0;[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/#website-assistant > header,\s*\n?\[data-revora-builder-workspace\] #website-assistant > header \* \{ overflow-wrap: normal/);
    expect(css).toMatch(/#website-assistant > header :is\(button, \[role="button"\]\) \{ flex-shrink: 0; \}/);
    expect(assistant).toContain('aria-label="Chat options"');
  });

  it("fades the top of the transcript so no clipped '…' shows under the header", () => {
    expect(css).toMatch(/#website-assistant \[role="log"\] > div \{[^}]*mask-image: linear-gradient/);
  });
});

describe("long planning never hangs", () => {
  it("shows the still-working hint from ~30s", () => {
    expect(PLAN_SLOW_HINT_MS).toBe(30_000);
    expect(planIsSlow(29_999)).toBe(false);
    expect(planIsSlow(30_000)).toBe(true);
    expect(assistant).toContain("Stop waiting");
    expect(assistant).toContain("requests.stopWaiting(task.id)");
  });

  it("rejects a stuck planner with a 'timed out' error so recovery then Retry runs", async () => {
    vi.useFakeTimers();
    try {
      const stuck = withDeadline(new Promise(() => {}), 1000);
      const caught = stuck.catch((e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await caught).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
    await expect(withDeadline(Promise.resolve(7), 1000)).resolves.toBe(7);
    expect(PLAN_HARD_TIMEOUT_MS).toBeLessThanOrEqual(10 * 60_000);
  });

  it("wires the deadline and a stop that drops late plans and frees the queue", () => {
    expect(hooks).toContain("await withDeadline(planFn({");
    expect(hooks).toMatch(/stopWaiting: \(id: string\) =>/);
    expect(hooks).toContain("abandonedRef.current.has(task.id)) return;");
    expect(hooks).toMatch(/if \(runningIdRef\.current !== next\.id\) return;/);
  });
});
