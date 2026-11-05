import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVIDENCE_WINDOW_DAYS, buildModelEvidence, successLabel, type RegistryInput, type TraceInput } from "./ai-model-evidence";
import { ModelEvidenceView } from "@/components/admin/city/ModelEvidence";

const at = (m: number) => new Date(Date.UTC(2026, 10, 5, 12, m)).toISOString();
const ok = (model: string | null, m: number): TraceInput => ({ model, provider: "lovable", ok: true, reason: null, created_at: at(m) });
const bad = (model: string | null, reason: string | null, m: number): TraceInput => ({ model, provider: "lovable", ok: false, reason, created_at: at(m) });
const registry: RegistryInput[] = [
  { model: "google/gemini-2.5-flash", provider: "lovable", display_name: "Gemini Flash", retired: false },
  { model: "openai/gpt-5", provider: "lovable", display_name: null, retired: false },
  { model: "old/model", provider: "lovable", display_name: null, retired: true },
];
const trace: TraceInput[] = [
  ok("google/gemini-2.5-flash", 1), ok("google/gemini-2.5-flash", 5), ok("Google/Gemini-2.5-Flash", 3),
  bad("google/gemini-2.5-flash", "402 payment required", 4), bad("google/gemini-2.5-flash", "request timed out", 6), bad("google/gemini-2.5-flash", null, 7),
  bad("x/other", "429 rate limit", 2), ok(null, 9),
];

describe("buildModelEvidence (JC-22)", () => {
  const e = buildModelEvidence({ trace, registry, checkedAt: "now" });
  it("counts calls, successes and failures per model, merging case differences", () => {
    expect(e.used?.[0]).toMatchObject({ model: "google/gemini-2.5-flash", calls: 6, ok: 3, failed: 3 });
    expect(successLabel(e.used![0]!)).toBe("50% (3 of 6)");
  });
  it("groups failures by recorded cause and leaves a missing reason as other", () => {
    expect(e.used![0]!.failuresByCause).toEqual([{ cause: "credits", count: 1 }, { cause: "other", count: 1 }, { cause: "timeout", count: 1 }]);
    expect(e.used![1]).toMatchObject({ model: "x/other", ok: 0, lastSuccessAt: null, failuresByCause: [{ cause: "rate_limit", count: 1 }] });
  });
  it("reports the newest success time only", () => {
    expect(e.used![0]!.lastSuccessAt).toBe(at(5));
  });
  it("does not attribute calls with no model name", () => {
    expect(e.unattributed).toBe(1);
    expect(e.used!.reduce((n, r) => n + r.calls, 0)).toBe(7);
  });
  it("lists configured models with no recorded call, skipping retired ones", () => {
    expect(e.neverUsed).toEqual([{ model: "openai/gpt-5", provider: "lovable", label: "openai/gpt-5" }]);
  });
  it("is unavailable, not zero, when a source cannot be read", () => {
    expect(buildModelEvidence({ trace: null, registry, checkedAt: "now" })).toMatchObject({ used: null, neverUsed: null, unattributed: null });
    expect(buildModelEvidence({ trace, registry: null, checkedAt: "now" }).neverUsed).toBeNull();
    expect(buildModelEvidence({ trace, registry: null, checkedAt: "now" }).used).not.toBeNull();
  });
  it("flags a full read as capped", () => {
    expect(buildModelEvidence({ trace, registry, checkedAt: "now", limit: 8 }).capped).toBe(true);
    expect(e.capped).toBe(false);
    expect(e.windowDays).toBe(EVIDENCE_WINDOW_DAYS);
  });
  it("says no calls were recorded rather than inventing models", () => {
    const empty = buildModelEvidence({ trace: [], registry, checkedAt: "now" });
    expect(empty.used).toEqual([]);
    expect(empty.neverUsed).toHaveLength(2);
  });
});

describe("ModelEvidenceView", () => {
  it("renders models, causes, last success in ET and the never-used list", () => {
    const html = renderToStaticMarkup(<ModelEvidenceView data={buildModelEvidence({ trace, registry, checkedAt: "now" })} loading={false} failed={false} />);
    expect(html).toContain("google/gemini-2.5-flash");
    expect(html).toContain("50% (3 of 6)");
    expect(html).toContain("Failed because:");
    expect(html).toContain("7:05 AM ET");
    expect(html).toContain("Configured, no recorded call");
    expect(html).toContain("openai/gpt-5");
    expect(html).toContain("1 call had no model name");
    expect(html).toContain("Read-only");
  });
  it("shows unavailable instead of working or zero when nothing was read", () => {
    const html = renderToStaticMarkup(<ModelEvidenceView data={undefined} loading={false} failed />);
    expect(html).toContain("Model evidence unavailable");
    expect(html).not.toMatch(/\d+%/);
    expect(renderToStaticMarkup(<ModelEvidenceView data={buildModelEvidence({ trace: null, registry: null, checkedAt: "now" })} loading={false} failed={false} />)).toContain("unavailable");
  });
  it("says so when no calls were recorded, and flags a capped read as a floor", () => {
    expect(renderToStaticMarkup(<ModelEvidenceView data={buildModelEvidence({ trace: [], registry: [], checkedAt: "now" })} loading={false} failed={false} />)).toContain("No model calls were recorded in the last 30 days");
    expect(renderToStaticMarkup(<ModelEvidenceView data={buildModelEvidence({ trace, registry, checkedAt: "now", limit: 3 })} loading={false} failed={false} />)).toContain("a floor");
  });
});
