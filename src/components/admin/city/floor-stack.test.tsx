import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CitySnapshot } from "@/lib/ai-city";
import { FloorStack } from "./FloorStack";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const at = new Date(NOW - 60_000).toISOString();
const snap = (jobs: CitySnapshot["sources"][string]): CitySnapshot => ({
  checkedAt: at,
  sources: { jobs },
});

describe("FloorStack", () => {
  it("shows the floor, its light as a word, and real counts", () => {
    const html = renderToStaticMarkup(
      <FloorStack
        district="factory"
        now={NOW}
        snapshot={snap({
          available: true,
          total: 1,
          truncated: false,
          rows: [
            {
              id: "j1",
              district: "factory",
              title: "Build",
              status: "running",
              at,
              source: "generation_jobs",
            },
          ],
        })}
      />,
    );
    expect(html).toContain('data-floor="jobs"');
    expect(html).toContain("Site builds");
    expect(html).toContain("Working");
    expect(html).toContain("1 running · 0 queued · 0 failed (48h) · 1 records");
    expect(html).toContain("generation_jobs");
  });

  it("says unavailable instead of zero when the read failed", () => {
    const html = renderToStaticMarkup(
      <FloorStack
        district="factory"
        now={NOW}
        snapshot={snap({ available: false, total: null, truncated: false, rows: [] })}
      />,
    );
    expect(html).toContain('data-light="unavailable"');
    expect(html).toContain("could not be read");
    expect(html).not.toMatch(/\b0 running/);
  });

  it("says floors are unavailable with no snapshot", () => {
    expect(
      renderToStaticMarkup(<FloorStack district="factory" now={NOW} snapshot={undefined} />),
    ).toContain("Floors unavailable.");
  });

  it("only pulses where motion is allowed", () => {
    const src = readFileSync(join(__dirname, "FloorStack.tsx"), "utf8");
    expect(src).toContain("motion-safe:animate-pulse");
    expect(src.match(/animate-/g)?.length).toBe(1);
  });
});
