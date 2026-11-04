/** The post-publish smoke check fails on the empty "being updated" shell. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_SITE_MARKER, evaluateSmoke } from "@/lib/publish-smoke";

const head = `<html><head><title>Elite Mobile Detailing</title><link rel="stylesheet" href="/a.css"></head>`;
const pad = "<!-- " + "x".repeat(600) + " -->";
const probe = (body: string) => [{ path: "/", status: 200, contentType: "text/html", body, ms: 5 }];

describe("empty-shell detection", () => {
  it("fails a 200 page that is only the being-updated notice", () => {
    const shell = `${head}<body><main ${EMPTY_SITE_MARKER}="" class="flex"><h1>Elite Mobile Detailing</h1><p>This website is being updated. Please check back soon.</p></main>${pad}</body></html>`;
    const result = evaluateSmoke(probe(shell), { businessName: "Elite Mobile Detailing" });
    expect(result.status).toBe("failed");
    expect(result.checks[0]?.problem).toMatch(/no sections/);
  });
  it("passes a real page with sections", () => {
    const real = `${head}<body><main><section><h1>Elite Mobile Detailing</h1><p>Full detail at your door.</p></section></main>${pad}</body></html>`;
    expect(evaluateSmoke(probe(real), { businessName: "Elite Mobile Detailing" }).status).toBe("passed");
  });
  it("does not trip on the marker name in visible text", () => {
    const text = `${head}<body><section><p>Elite Mobile Detailing ${EMPTY_SITE_MARKER}</p></section>${pad}</body></html>`;
    expect(evaluateSmoke(probe(text), { businessName: "Elite Mobile Detailing" }).status).toBe("passed");
  });
  it("PublicSiteView sets the marker on the notice", () => {
    expect(readFileSync("src/components/site/PublicSiteView.tsx", "utf8")).toContain("[EMPTY_SITE_MARKER]");
  });
});
