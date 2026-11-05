import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProspectDemoListItem } from "./ProspectDemoBuilder";
import type { ProspectDemoSummary } from "@/lib/jarvis-demo-site.server";

const noop = () => undefined;

function demo(overrides: Partial<ProspectDemoSummary> = {}, build?: ProspectDemoSummary["build"]): ProspectDemoSummary {
  return {
    organizationId: "11111111-2222-3333-4444-555555555555",
    name: "Triangle Comfort HVAC",
    industry: "HVAC",
    createdAt: "2026-11-05T00:00:00Z",
    previewToken: "tok_demo_preview_abcdefgh",
    claimedAt: null,
    thumbnailUrl: null,
    build:
      build === undefined
        ? { status: "processing", progress: 46, step: "conversion", error: null, wait: null }
        : build,
    ...overrides,
  };
}

function view(row: ProspectDemoSummary) {
  return renderToStaticMarkup(
    <ProspectDemoListItem
      demo={row}
      previewHref={`https://app.example.com/p/${row.previewToken}`}
      onCopyLink={noop}
      draftingPending={false}
      draftingThis={false}
      onWriteEmail={noop}
      draft={undefined}
      body=""
      onBodyChange={noop}
      onCopyEmail={noop}
    />,
  );
}

/** Visible text outside tags (no regex tag stripping). */
function textOutsideTags(html: string) {
  let out = "";
  let depth = 0;
  for (const ch of html) {
    if (ch === "<") depth += 1;
    else if (ch === ">") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

describe("ProspectDemoListItem (JC-56)", () => {
  it("shows the real stage label and stage list, not a bare % as the primary signal", () => {
    const html = view(demo());
    const visible = textOutsideTags(html);
    expect(html).toContain('data-testid="demo-stage-label"');
    expect(html).toContain("Working on: pictures generated and checked");
    expect(html).toContain('aria-label="Build stages"');
    expect(html).toContain("Stages · 7 of 14 done");
    // Bare "46%" must not be the headline progress cue in the list row.
    expect(visible).not.toMatch(/\b46%\b/);
    expect(html).not.toMatch(/role="progressbar"[^>]*aria-valuenow="46"/);
  });

  it("renders an HTTPS thumbnail only, never a placeholder or http image", () => {
    const withHttps = view(demo({ thumbnailUrl: "https://cdn.example.com/hero.jpg" }));
    expect(withHttps).toContain('data-testid="demo-thumbnail"');
    expect(withHttps).toContain('src="https://cdn.example.com/hero.jpg"');

    const withHttp = view(demo({ thumbnailUrl: "http://cdn.example.com/hero.jpg" })); // DevSkim: ignore DS137138 -- Negative fixture: non-HTTPS thumbnails must be rejected.
    expect(withHttp).not.toContain('data-testid="demo-thumbnail"');
    expect(withHttp).not.toContain("http://cdn.example.com/hero.jpg"); // DevSkim: ignore DS137138

    const none = view(demo({ thumbnailUrl: null }));
    expect(none).not.toContain('data-testid="demo-thumbnail"');
    expect(none).not.toContain("<img");
  });

  it("keeps the private demo link (open + copy) prominent", () => {
    const html = view(demo({ build: { status: "completed", progress: 100, step: null, error: null, wait: null } }));
    expect(html).toContain('data-testid="demo-open-preview"');
    expect(html).toContain('href="/p/tok_demo_preview_abcdefgh"');
    expect(html).toContain('data-testid="demo-copy-link"');
    expect(html).toContain("Private demo link: https://app.example.com/p/tok_demo_preview_abcdefgh");
    expect(html).toContain("Draft ready");
  });
});
