import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JarvisTalkStatus } from "./JarvisTalkStatus";
import { LiveSurface } from "./LiveSurface";
import { TALK_UNSUPPORTED_MESSAGE } from "@/components/app/jarvis-voice-gate";

const noop = () => undefined;

describe("JarvisTalkStatus", () => {
  it.each([
    ["listening", "Jarvis is listening."],
    ["thinking", "Jarvis is thinking."],
    ["speaking", "Jarvis is speaking. Tap to interrupt."],
  ] as const)("announces %s in one polite live region", (state, text) => {
    const html = renderToStaticMarkup(<JarvisTalkStatus state={state} talkOn notice={null} onDismissNotice={noop} />);
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).toContain('role="status"');
    expect(html).toContain(text);
    expect(html).not.toContain("<button");
  });

  it("keeps the region mounted and empty while Talk is off", () => {
    const html = renderToStaticMarkup(<JarvisTalkStatus state="idle" talkOn={false} notice={null} onDismissNotice={noop} />);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<p[^>]*aria-live="polite"[^>]*><\/p>/);
  });

  it("shows and announces why Talk can't run, with a 44px dismiss button", () => {
    const html = renderToStaticMarkup(<JarvisTalkStatus state="idle" talkOn={false} notice={TALK_UNSUPPORTED_MESSAGE} onDismissNotice={noop} />);
    const escaped = TALK_UNSUPPORTED_MESSAGE.replace(/'/g, "&#x27;");
    expect(html.split(escaped).length - 1).toBe(2);
    expect(html).toContain('aria-label="Dismiss voice notice"');
    expect(html).toMatch(/<button[^>]*min-h-11 min-w-11/);
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
  });
});

describe("LiveSurface", () => {
  const view = (state: "idle" | "listening" | "thinking" | "speaking", busy = false) =>
    renderToStaticMarkup(<LiveSurface state={state} level={0.5} label="x" busy={busy} onTapToTalk={noop} onEnd={noop} />);

  it("has no live region of its own and every button is at least 44px", () => {
    const html = view("idle");
    expect(html).not.toContain("aria-live");
    for (const [, attrs] of html.matchAll(/<button\b([^>]*)>/g)) expect(attrs).toMatch(/min-h-11/);
  });

  it("offers Interrupt and talk while Jarvis speaks, and disables the button only while listening or thinking", () => {
    const speaking = view("speaking");
    expect(speaking).toContain("Interrupt and talk");
    expect(speaking).not.toMatch(/<button[^>]*disabled=""[^>]*>.*Interrupt/);
    expect(view("idle")).toContain("Tap to talk");
    expect(view("listening")).toMatch(/disabled=""[^>]*>.*Listening…/);
    expect(view("idle", true)).toContain("Thinking…");
  });
});
