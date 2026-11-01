// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => ({ region: true, gpc: false }));
vi.mock("@/lib/consent", () => ({
  isConsentRequiredRegion: async () => consent.region,
  hasGlobalPrivacyControl: () => consent.gpc,
}));

import { ContactMap } from "@/components/site/ContactMap";
import { FRAME_CHOICE_TTL_MS, FRAME_CONSENT_KEY } from "@/components/site/ConsentFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mapsLink = "https://www.google.com/maps/place/Elite+Mobile+Detailing/@35.7796,-78.6382,17z";
const site = {
  social: { google_business: mapsLink },
  profile: { address: "1 Main St", city: "Raleigh", state: "NC" },
} as never;

let root: Root;
let host: HTMLDivElement;
async function render() {
  await act(async () => {
    root.render(<ContactMap site={site} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  consent.region = true;
  consent.gpc = false;
  window.sessionStorage.clear();
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ConsentFrame (Google Map)", () => {
  it("asks first in a consent region, with the address and a plain Maps link", async () => {
    await render();
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.textContent).toContain("Show Google Maps");
    expect(host.textContent).toContain("1 Main St");
    expect(host.querySelector("a")?.getAttribute("href")).toBe(mapsLink);
  });

  it("loads the map after a click and remembers it in this browser", async () => {
    await render();
    await act(async () => {
      host.querySelector("button")?.click();
    });
    const frame = host.querySelector("iframe");
    expect(frame?.getAttribute("src")).toContain("output=embed");
    expect(frame?.getAttribute("sandbox")).toBeTruthy();
    const stored = JSON.parse(window.localStorage.getItem(FRAME_CONSENT_KEY) ?? "{}");
    expect(Object.keys(stored)).toEqual(["Google Maps"]);
    expect(typeof stored["Google Maps"]).toBe("number");
  });

  it("writes nothing before the click", async () => {
    await render();
    expect(window.localStorage.getItem(FRAME_CONSENT_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(FRAME_CONSENT_KEY)).toBeNull();
  });

  it("loads in another tab of the same browser after a recent click", async () => {
    window.localStorage.setItem(FRAME_CONSENT_KEY, JSON.stringify({ "Google Maps": Date.now() }));
    await render();
    expect(host.querySelector("iframe")).not.toBeNull();
  });

  it("asks again and deletes the entry once the 24 hours are up", async () => {
    window.localStorage.setItem(
      FRAME_CONSENT_KEY,
      JSON.stringify({ "Google Maps": Date.now() - FRAME_CHOICE_TTL_MS - 1 }),
    );
    await render();
    expect(host.querySelector("iframe")).toBeNull();
    expect(window.localStorage.getItem(FRAME_CONSENT_KEY)).toBeNull();
  });

  it("falls back to this tab when localStorage is blocked", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage) throw new Error("blocked");
      setItem.mockRestore();
      window.sessionStorage.setItem(key, value);
    });
    await render();
    await act(async () => {
      host.querySelector("button")?.click();
    });
    expect(host.querySelector("iframe")).not.toBeNull();
    expect(window.sessionStorage.getItem(FRAME_CONSENT_KEY)).toContain("Google Maps");
  });

  it("loads on its own outside consent regions", async () => {
    consent.region = false;
    await render();
    expect(host.querySelector("iframe")).not.toBeNull();
  });

  it("still asks outside consent regions when the browser sends GPC", async () => {
    consent.region = false;
    consent.gpc = true;
    await render();
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.textContent).toContain("Show Google Maps");
  });
});
