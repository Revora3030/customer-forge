import { describe, expect, it } from "vitest";
import { inspectHtml, summarise } from "@/lib/agent/verify";

const good = `<!doctype html><html lang="en"><head><title>Elite Detailing — Mobile car detailing</title>
<meta name="description" content="Mobile detailing that comes to your driveway across the metro area." />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="canonical" href="https://example.com/" />
<script type="application/ld+json">{"@type":"LocalBusiness"}</script></head>
<body><h1>Mobile detailing at your door</h1>
<p>${"We bring a full valet service to your driveway, seven days a week. ".repeat(6)}</p>
<img src="/a.jpg" alt="A detailed car" />
<a href="/s/elite/services">Services</a><a href="/book">Book now</a><a href="#top">Top</a><a href="https://x.com/e">X</a>
</body></html>`;

describe("inspectHtml", () => {
  it("passes a complete page and collects only same-site links", () => {
    const result = inspectHtml(good, "Home");
    expect(result.checks.every((check) => check.ok)).toBe(true);
    expect(result.links).toEqual(["/s/elite/services"]);
  });

  it("flags a missing headline as critical", () => {
    const result = inspectHtml(good.replace(/<h1[\s\S]*?<\/h1>/, ""), "Home");
    const failed = result.checks.find((check) => !check.ok);
    expect(failed?.severity).toBe("critical");
    expect(failed?.label).toContain("headline");
  });

  it("flags a page that is not readable on a phone", () => {
    const result = inspectHtml(good.replace(/<meta name="viewport"[^>]*>/, ""), "Home");
    expect(
      result.checks.some((check) => !check.ok && check.label.includes("readable on a phone")),
    ).toBe(true);
  });

  it("catches leaked placeholder text", () => {
    const result = inspectHtml(good.replace("seven days a week", "Lorem ipsum dolor"), "Home");
    const failed = result.checks.find((check) => !check.ok);
    expect(failed?.severity).toBe("critical");
    expect(failed?.detail).toContain("Lorem ipsum");
  });

  it("warns, not fails, about a photo with no description", () => {
    const result = inspectHtml(good.replace(' alt="A detailed car"', ""), "Home");
    const failed = result.checks.find((check) => !check.ok);
    expect(failed?.severity).toBe("warning");
  });

  it("warns about more than one main headline", () => {
    const result = inspectHtml(good.replace("</h1>", "</h1><h1>Second</h1>"), "Home");
    expect(
      result.checks.some((check) => !check.ok && check.label.includes("Only one main headline")),
    ).toBe(true);
  });
});

describe("summarise", () => {
  it("reports critical failures ahead of warnings", () => {
    const report = summarise([
      { label: "a", ok: false, severity: "critical", where: "Home" },
      { label: "b", ok: false, severity: "warning", where: "Home" },
      { label: "c", ok: true, severity: "warning", where: "Home" },
    ]);
    expect(report).toMatchObject({ critical: 1, warnings: 1, passed: 1 });
    expect(report.summary).toContain("require attention");
  });

  it("is honest when nothing could be checked", () => {
    expect(summarise([]).summary).toBe("No pages could be checked.");
  });

  it("returns a weighted score and category breakdown", () => {
    const report = summarise([
      { label: "headline", ok: true, severity: "critical", where: "Home", category: "content" },
      { label: "seo", ok: false, severity: "warning", where: "Home", category: "seo" },
      { label: "broken", ok: false, severity: "critical", where: "Home", category: "technical" },
    ]);
    expect(report.score).toBe(25);
    expect(report.categories.content.passed).toBe(1);
    expect(report.categories.seo.failed).toBe(1);
    expect(report.categories.technical.failed).toBe(1);
  });

  it("acknowledges a clean pass", () => {
    expect(summarise([{ label: "a", ok: true, severity: "critical", where: "Home" }]).summary).toBe(
      "Verified the served page — every check passed.",
    );
  });
});
