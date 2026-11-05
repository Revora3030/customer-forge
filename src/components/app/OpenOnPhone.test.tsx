import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenOnPhoneButton, OpenOnPhoneQr, QrStatus } from "./OpenOnPhone";

const live = { kind: "live" as const, url: "https://example.com/s/acme", label: "your live website" };

describe("OpenOnPhoneQr", () => {
  it("shows the link as text and a status tile (never a broken image) until the QR exists", () => {
    const html = renderToStaticMarkup(<OpenOnPhoneQr link={live} />);
    expect(html).toContain("https://example.com/s/acme");
    expect(html).toContain("Making your QR code");
    expect(html).not.toContain("<img");
    expect(html).toContain("Copy link");
  });
  it("explains a QR failure and points to the link", () => {
    expect(renderToStaticMarkup(<QrStatus state="error" />)).toContain("Use the link below");
  });
});

describe("OpenOnPhoneButton", () => {
  it("renders nothing without a real link", () => {
    expect(renderToStaticMarkup(<OpenOnPhoneButton link={null} />)).toBe("");
  });
  it("renders a labelled toolbar button for a link", () => {
    const html = renderToStaticMarkup(<OpenOnPhoneButton link={live} />);
    expect(html).toContain('aria-label="Open on your phone"');
  });
});
