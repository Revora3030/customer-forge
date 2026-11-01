// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ChatLauncher, chatLauncherActions } from "./ChatLauncher";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("chatLauncherActions", () => {
  it("offers only call and quote from real facts, never sms, email or AI", () => {
    const actions = chatLauncherActions({ businessName: "A", telHref: "tel:+16140000142", phoneDisplay: "(614) 000-0142", quoteHref: "#quote" });
    expect(actions.map((a) => a.key)).toEqual(["call", "quote"]);
    expect(actions.every((a) => /^(tel:|#)/.test(a.href))).toBe(true);
    expect(JSON.stringify(actions)).not.toMatch(/sms:|chatbot|\bAI\b/i);
  });
  it("drops actions whose fact is missing or malformed", () => {
    expect(chatLauncherActions({ businessName: "A", telHref: "tel:12", phoneDisplay: null, quoteHref: null })).toEqual([]);
  });
});

describe("ChatLauncher", () => {
  it("opens a panel, focuses the first action and closes on Escape", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<ChatLauncher businessName="Sample" telHref="tel:+16140000142" phoneDisplay="(614) 000-0142" quoteHref="#quote" />));
    const button = host.querySelector<HTMLButtonElement>(".rv-chat-button")!;
    expect(host.querySelector("[role=dialog]")).toBeNull();
    act(() => button.click());
    expect(host.querySelector("[role=dialog]")).not.toBeNull();
    expect(document.activeElement?.getAttribute("href")).toBe("tel:+16140000142");
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(host.querySelector("[role=dialog]")).toBeNull();
    act(() => root.unmount());
  });
  it("renders nothing when there is no real action", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<ChatLauncher businessName="Sample" telHref={null} phoneDisplay={null} quoteHref={null} />));
    expect(host.innerHTML).toBe("");
    act(() => root.unmount());
  });
});
