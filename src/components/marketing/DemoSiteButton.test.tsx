// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DemoSiteButton } from "./DemoSiteButton";
import { DEMO_SITE_LIVE, DEMO_SITE_REFRESHING_NOTE } from "@/lib/demo-workspace";

describe("/demo sample-site button", () => {
  it("is off while the Elite sample site serves its holding page", () => {
    expect(DEMO_SITE_LIVE).toBe(false);
  });

  it("renders a disabled button with an honest note, never a link to the holding page", () => {
    const html = renderToStaticMarkup(<DemoSiteButton>Open the demo business site</DemoSiteButton>);
    expect(html).toContain("disabled");
    expect(html).toContain(DEMO_SITE_REFRESHING_NOTE);
    expect(html).not.toContain("/s/elite-mobile-detailing");
    expect(html).not.toContain("<a ");
  });

  it("/demo and the live demo widget link the sample site only through DemoSiteButton", () => {
    for (const file of [
      "src/routes/demo.index.tsx",
      "src/components/marketing/LiveSystemDemo.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/to="\/s\/\$slug"/);
      expect(src).toContain("<DemoSiteButton");
    }
  });
});
