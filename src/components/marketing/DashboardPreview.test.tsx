import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { DashboardPreview } from "./DashboardPreview";

describe("sample dashboard trust and accessibility", () => {
  it("labels sample metrics and states that the preview performs no live actions", () => {
    const html = renderToStaticMarkup(<DashboardPreview />);
    expect(html).toContain("Illustrative preview");
    expect(html).toContain("not live customer");
    expect(html).toContain("does not send messages, create bookings or process payments");
    expect(html).toContain("Sample contact 1");
    expect(html).not.toContain("Marcus Bell");
  });

  it("exposes static workflow examples and a keyboard-focusable pipeline", () => {
    const html = renderToStaticMarkup(<DashboardPreview />);
    expect(html).toContain('aria-label="Illustrative automation examples"');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("scroll horizontally to view all stages");
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("does not use a recurring timer to simulate live activity", () => {
    const source = readFileSync(new URL("./DashboardPreview.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("real work it just did");
    expect(source).not.toContain("animate-ping");
  });
});
