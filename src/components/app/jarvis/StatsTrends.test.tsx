import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatsTrendsView } from "./StatsTrends";
import { buildOpsStatsTrends } from "@/lib/ops-stats-trends";

const NOW = Date.parse("2026-11-05T12:00:00Z");

describe("StatsTrendsView", () => {
  it("renders measured sparklines with N and says not measured for unreadables", () => {
    const stamp = new Date(NOW - 86_400_000).toISOString();
    const data = buildOpsStatsTrends({
      buildsOk: [stamp, stamp, stamp],
      buildsFailed: null,
      leads: [],
      trials: [stamp],
      approvalsWaited: [stamp],
      checkedAt: new Date(NOW).toISOString(),
      now: NOW,
    });
    const html = renderToStaticMarkup(<StatsTrendsView data={data} loading={false} failed={false} />);
    expect(html).toContain("Stats trends");
    expect(html).toContain("Builds completed");
    expect(html).toContain("3 (N=3)");
    expect(html).toContain("not measured");
    expect(html).toContain("Builds failed");
    expect(html).toContain("peak 3 per day");
    expect(html).toContain("Open Executive district");
    expect(html).toContain("/admin/city?district=executive");
  });

  it("does not invent a calm empty board when the load failed", () => {
    const html = renderToStaticMarkup(<StatsTrendsView data={undefined} loading={false} failed />);
    expect(html).toContain("Trends unavailable");
    expect(html).not.toContain("Builds completed");
  });
});
