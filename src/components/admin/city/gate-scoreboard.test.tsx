import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GateScoreboardView } from "./GateScoreboard";
import { buildScoreboard } from "@/lib/builder/quality/gate-scoreboard";

const SITES = [{ organizationId: "org-aaaaaaaa", name: "Acme Plumbing", lastBuildAt: "2026-11-04T10:00:00Z" }, { organizationId: "org-bbbbbbbb", name: null, lastBuildAt: null }];

describe("GateScoreboardView", () => {
  it("shows stored scores and NOT_VERIFIED for unmeasured sites, with N", () => {
    const board = buildScoreboard({ sites: SITES, rows: [{ organization_id: "org-aaaaaaaa", event_kind: "build_score", score: 86, bar: 80, passed: true, gate_mode: null, failures: [], created_at: "2026-11-04T00:00:00Z" }] });
    const html = renderToStaticMarkup(<GateScoreboardView board={board} />);
    expect(html).toContain("Acme Plumbing");
    expect(html).toContain("86/100 (bar 80)");
    expect(html).toContain("Meets bar");
    expect(html).toContain("NOT_VERIFIED");
    expect(html).toContain("N=2 sites");
    expect(html).toContain("org-bbbb");
  });

  it("says the log is unreadable instead of showing scores", () => {
    const html = renderToStaticMarkup(<GateScoreboardView board={buildScoreboard({ sites: SITES, rows: null })} />);
    expect(html).toContain("Quality log not readable yet");
    expect(html).not.toContain("/100");
  });

  it("handles error, loading and empty states", () => {
    expect(renderToStaticMarkup(<GateScoreboardView board={undefined} error />)).toContain("Gate scores unavailable");
    expect(renderToStaticMarkup(<GateScoreboardView board={undefined} loading />)).toContain("Loading recorded gate scores");
    expect(renderToStaticMarkup(<GateScoreboardView board={buildScoreboard({ sites: [], rows: [] })} />)).toContain("No site builds in the last 14 days");
  });
});
