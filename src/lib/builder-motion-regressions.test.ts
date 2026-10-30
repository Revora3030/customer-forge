/**
 * Regressions for the builder page (/app/website) that made automation clicks
 * time out and sent half-typed messages.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_TIMER_MS, trialFlipDelay } from "@/lib/trial-clock";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("app layout does not re-render every second", () => {
  it("reads only the trial's expired flip in the layout; the label ticks on its own", () => {
    const layout = read("src/routes/_authenticated/app.tsx");
    expect(layout).not.toMatch(/useTrialCountdown\(/);
    expect(layout).toMatch(/useTrialExpiry\(/);
    expect(layout).toMatch(/<TrialCountdownLabel /);
  });

  it("waits until the deadline instead of ticking", () => {
    expect(trialFlipDelay(null, 0)).toBeNull();
    expect(trialFlipDelay(1_000, 2_000)).toBeNull(); // already expired: nothing left to flip
    expect(trialFlipDelay(61_000, 1_000)).toBe(60_050);
    expect(trialFlipDelay(Number.MAX_SAFE_INTEGER, 0)).toBe(MAX_TIMER_MS);
  });
});

describe("reduced motion", () => {
  it("the chat log scrolls instantly for reduced motion", () => {
    const source = read("src/components/ai-elements/conversation.tsx");
    expect(source).toMatch(/useReducedMotion\(\)/);
    expect(source).toMatch(/reduced \? "instant" : "smooth"/);
  });

  it("the global stylesheet still stops animations for reduced motion", () => {
    const css = read("src/styles.css");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,/);
  });
});

describe("half-typed messages are never sent by another form", () => {
  it("the website brief dialog keeps its submit to itself", () => {
    const dialog = read("src/components/app/WebsiteBriefDialog.tsx");
    expect(dialog).toMatch(/event\.stopPropagation\(\)/);
    expect(dialog).toMatch(/<Button type="button" variant="ghost" size="icon-sm"/);
  });

  it("the composer ignores submits that bubble from portalled forms", () => {
    const composer = read("src/components/ai-elements/prompt-input.tsx");
    expect(composer).toMatch(/if \(!isOwnFormSubmit\(event\.target, event\.currentTarget\)\) return;/);
  });
});
