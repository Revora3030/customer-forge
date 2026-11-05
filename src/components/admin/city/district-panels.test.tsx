import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthFunnelView } from "./GrowthFunnel";
import { ReleaseBoardView } from "./ReleaseBoard";
import { MemoryHealthView } from "./MemoryHealth";
import { buildGrowthFunnel, buildMemoryHealth, buildReleaseBoard } from "@/lib/ai-city-panels";

describe("GrowthFunnelView", () => {
  it("shows unavailable rather than an empty funnel", () => {
    expect(renderToStaticMarkup(<GrowthFunnelView data={undefined} loading={false} failed />)).toContain("Funnel unavailable");
  });
  it("shows honest dashes and a not-recorded window when nothing was read", () => {
    const data = buildGrowthFunnel({ funnel7: null, funnel30: null, inboxTotal: null, inboxNeedsReview: null, inboxUnprocessed: null, demosFound: null, demosReady: null, approvals: null, checkedAt: "now" });
    const html = renderToStaticMarkup(<GrowthFunnelView data={data} loading={false} failed={false} />);
    expect(html).toContain("not recorded or unreadable");
    expect(html).toContain("Read-only");
    expect(html).not.toMatch(/>0</);
  });
  it("renders the four steps and prospect counts", () => {
    const data = buildGrowthFunnel({
      funnel7: { days: 7, stages: [{ key: "visitors", count: 40, rate: null }, { key: "accounts", count: 3, rate: 7.5 }, { key: "trials", count: 2, rate: 66.67 }, { key: "paid", count: 1, rate: 50 }] },
      funnel30: null, inboxTotal: 5, inboxNeedsReview: 2, inboxUnprocessed: 0, demosFound: 4, demosReady: 3, approvals: 6, checkedAt: "now",
    });
    const html = renderToStaticMarkup(<GrowthFunnelView data={data} loading={false} failed={false} />);
    for (const label of ["Visitors", "Accounts", "Trials", "Paid", "Prospect replies", "Approvals waiting", "Demos ready"]) expect(html).toContain(label);
    expect(html).toContain(">40<");
  });
});

describe("ReleaseBoardView", () => {
  it("shows missing CI evidence as no evidence, not a pass, and says error groups are unreadable", () => {
    const html = renderToStaticMarkup(<ReleaseBoardView data={buildReleaseBoard({ evidence: null, contracts: null, checkedAt: "now" })} loading={false} failed={false} errors={null} />);
    expect(html.match(/No evidence/g)).toHaveLength(3);
    expect(html).not.toContain("Passed");
    expect(html).toContain("not recorded");
    expect(html).toContain("Error groups unavailable");
    expect(html).toContain("not run (unreadable)");
  });
  it("lists open error groups and a passing gate on the exact commit", () => {
    const head = "c".repeat(40);
    const data = buildReleaseBoard({ evidence: { status: "observed", branchHeadCommit: head, runs: [{ name: "Revora Quality Gate", status: "completed", conclusion: "success", commit: head, url: null }] }, contracts: [{ table: "t", status: "query_contract_accepted", code: null }], checkedAt: "now" });
    const html = renderToStaticMarkup(<ReleaseBoardView data={data} loading={false} failed={false} errors={{ count: 3, capped: false, groups: [{ key: "k", label: "Build timeout", count: 3, ageMs: 1000 }] }} />);
    expect(html).toContain("Passed");
    expect(html).toContain("3× Build timeout");
    expect(html).toContain("1 accepted");
  });
});

describe("MemoryHealthView", () => {
  it("shows a disabled Review and not-recorded contradictions while JC-41 is missing", () => {
    const html = renderToStaticMarkup(<MemoryHealthView data={buildMemoryHealth({ saved: 12, stale: 3, replaced: 1, checkedAt: "now" })} loading={false} failed={false} />);
    expect(html).toContain(">12<");
    expect(html).toContain("not recorded");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain("JC-41");
  });
  it("shows dashes when the counts are unreadable and unavailable on failure", () => {
    const html = renderToStaticMarkup(<MemoryHealthView data={buildMemoryHealth({ saved: null, stale: null, replaced: null, checkedAt: "now" })} loading={false} failed={false} />);
    expect(html).not.toMatch(/>0</);
    expect(html).toContain("not readable yet");
    expect(renderToStaticMarkup(<MemoryHealthView data={undefined} loading={false} failed />)).toContain("Memory health unavailable");
  });
});
