import { describe, expect, it } from "vitest";
import { isBareRebuildCommand, wantsFreshRebuild } from "./rebuild-intent";

describe("wantsFreshRebuild", () => {
  it("catches the whole-site rebuild requests an owner actually types", () => {
    for (const text of [
      "Fresh rebuild",
      "fresh rebuild please",
      "Do a fresh rebuild",
      "Rebuild my website from scratch",
      "rebuild the whole site",
      "Start over with my website",
      "redo everything",
      "Rebuild my website from scratch. Design a high-ticket, cinematic auto-detailing site with a sticky mobile action bar.",
    ]) expect(wantsFreshRebuild(text), text).toBe(true);
  });

  it("leaves edits and questions for the edit planner", () => {
    for (const text of [
      "Rebuild the hero section",
      "redo this section",
      "write the about copy from scratch",
      "Make the website warmer",
      "What does the fresh rebuild do?",
      "How long does a fresh rebuild take?",
      "Add a quote estimator",
      "",
    ]) expect(wantsFreshRebuild(text), text).toBe(false);
  });

  it("does not treat a long brief that mentions rebuilding as the command", () => {
    expect(wantsFreshRebuild(`${"Here is everything about my business and how I work. ".repeat(10)} rebuild my website`)).toBe(false);
  });
});

describe("isBareRebuildCommand", () => {
  it("separates the bare command from a rebuild with design direction", () => {
    expect(isBareRebuildCommand("Fresh rebuild")).toBe(true);
    expect(isBareRebuildCommand("do a fresh rebuild please.")).toBe(true);
    expect(isBareRebuildCommand("Rebuild my website from scratch, dark and cinematic")).toBe(false);
    expect(isBareRebuildCommand("fresh rebuild with a darker look")).toBe(false);
  });
});
