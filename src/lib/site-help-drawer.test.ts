import { describe, expect, it } from "vitest";
import {
  HELP_DRAWER_IDLE_MS,
  helpDrawerActions,
  readHelpDrawerEnabled,
  shouldOpenHelpDrawer,
} from "@/lib/site-help-drawer";
import { stickyActions } from "@/components/site/site-sections-utils";

describe("readHelpDrawerEnabled", () => {
  it("is off by default and for anything malformed", () => {
    for (const v of [null, undefined, {}, [], "x", { helpDrawer: null }, { helpDrawer: {} }, { helpDrawer: { enabled: "true" } }, { helpDrawer: { enabled: 1 } }, { helpDrawer: { enabled: false } }]) {
      expect(readHelpDrawerEnabled(v)).toBe(false);
    }
  });
  it("is on only for an explicit true", () => expect(readHelpDrawerEnabled({ helpDrawer: { enabled: true } })).toBe(true));
});

describe("shouldOpenHelpDrawer", () => {
  const base = { started: true, lastActivityAt: 0, now: HELP_DRAWER_IDLE_MS, quoteDone: false, dismissed: false, tabHidden: false, hasActions: true };
  it("opens after idle once started", () => expect(shouldOpenHelpDrawer(base)).toBe(true));
  it("waits until the idle time has passed", () => expect(shouldOpenHelpDrawer({ ...base, now: HELP_DRAWER_IDLE_MS - 1 })).toBe(false));
  it.each([
    ["not started", { started: false }],
    ["quote submitted", { quoteDone: true }],
    ["dismissed", { dismissed: true }],
    ["tab hidden", { tabHidden: true }],
    ["nothing to offer", { hasActions: false }],
  ])("stays closed when %s", (_n, patch) => expect(shouldOpenHelpDrawer({ ...base, ...patch })).toBe(false));
});

describe("helpDrawerActions", () => {
  it("offers the verified phone and the way back to the quote", () => {
    const acts = stickyActions({ phone: "(305) 482-7719", hasQuote: true, contactHref: "#contact" });
    expect(helpDrawerActions(acts)).toEqual([
      { label: "Call us now", href: "tel:3054827719", kind: "call" },
      { label: "Finish my quote", href: "#contact", kind: "quote" },
    ]);
  });
  it("never offers a call to a placeholder or missing phone", () => {
    expect(helpDrawerActions(stickyActions({ phone: "555-0100", hasQuote: true, contactHref: "#contact" })).map((a) => a.kind)).toEqual(["quote"]);
    expect(helpDrawerActions(stickyActions({ phone: null, hasQuote: true, contactHref: "#contact" })).map((a) => a.kind)).toEqual(["quote"]);
  });
});
