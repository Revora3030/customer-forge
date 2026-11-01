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
import { FRAME_CONSENT_KEY } from "@/components/site/ConsentFrame";

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

  it("loads the map after a click and remembers it for the tab", async () => {
    await render();
    await act(async () => {
      host.querySelector("button")?.click();
    });
    const frame = host.querySelector("iframe");
    expect(frame?.getAttribute("src")).toContain("output=embed");
    expect(frame?.getAttribute("sandbox")).toBeTruthy();
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
