import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runVideoGate } from "@/lib/builder/quality/video-gate";
import { buildScoreRow, gateAttemptRow, gateRecorder, publishCheckRow, recordQualityEvent, summarizeByTrade, type LogClient, type QualityLogRow } from "@/lib/builder/quality/video-quality-log";
import { blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";

const ORG = "11111111-1111-4111-8111-111111111111";
const bp = blueprintFor("golf course");
const common = { organizationId: ORG, tradeSlug: bp.slug, blueprintSource: bp.source };
const weak = () => { const i = goodSite(bp); i.site.sections = i.site.sections.filter((s) => s.id !== "tool" && s.id !== "lead"); return i; };
const fixer = async () => ({ sections: goodSite(bp).site.sections });

function client(error: { message: string } | null = null) {
  const rows: QualityLogRow[] = [];
  const c: LogClient = { from: () => ({ insert: async (row) => { rows.push(row); return { error }; } }) };
  return { c, rows };
}

describe("quality log rows", () => {
  it("records every gate attempt and the final build with criteria ids, scores and the roles used", async () => {
    const { c, rows } = client();
    const result = await runVideoGate({ ...weak(), regenerate: fixer, record: gateRecorder(c, common, 85) });
    await recordQualityEvent(c, buildScoreRow(common, result));
    expect(rows.filter((r) => r.event_kind === "gate_attempt")).toHaveLength(result.attempts.length);
    const first = rows[0]!;
    expect(first).toMatchObject({ organization_id: ORG, trade_slug: bp.slug, attempt: 0, bar: 85, passed: false, capped: "no_lead_capture" });
    expect(first.failures.map((f) => f.criterion)).toEqual(expect.arrayContaining(["signature_tool", "lead_capture"]));
    expect(first.step_roles).toMatchObject({ check: "fast" });
    const build = rows.at(-1)!;
    expect(build).toMatchObject({ event_kind: "build_score", passed: true, bar: 85, failures: [] });
  });

  it("stores no free text: only ids, numbers and modes", () => {
    const row = publishCheckRow(common, { score: 61.4, bar: 85, passed: false, mode: "enforce", failures: ["lead_capture", "images"] });
    expect(row).toMatchObject({ event_kind: "publish_check", score: 61, gate_mode: "enforce", passed: false });
    expect(JSON.stringify(row)).not.toMatch(/@|\(\d{3}\)/);
    expect(Object.keys(row).sort()).toEqual(["attempt", "bar", "blueprint_source", "capped", "event_kind", "failures", "gate_mode", "organization_id", "passed", "score", "step_roles", "trade_slug"]);
  });

  it("normalises the trade slug, drops unknown blueprint sources and caps the attempt", () => {
    const row = publishCheckRow({ organizationId: ORG, tradeSlug: " Pressure Washing! ", blueprintSource: "mystery" }, { score: 90, bar: 85, passed: true, mode: "warn", failures: [] });
    expect(row.trade_slug).toBe("pressure-washing");
    expect(row.blueprint_source).toBeNull();
    expect(gateAttemptRow(common, { attempt: 99, score: 1, rawScore: 1, passed: false, capped: null, failures: [], regenerated: [], roles: { check: "fast", regenerate: [] } }, 85).attempt).toBe(10);
  });
});

describe("recordQualityEvent", () => {
  it("never throws and reports false on an error or a missing table", async () => {
    const row = publishCheckRow(common, { score: 90, bar: 85, passed: true, mode: "enforce", failures: [] });
    expect(await recordQualityEvent(client().c, row)).toBe(true);
    expect(await recordQualityEvent(client({ message: 'relation "builder_quality_log" does not exist' }).c, row)).toBe(false);
    const throwing: LogClient = { from: () => ({ insert: () => { throw new Error("boom"); } }) };
    expect(await recordQualityEvent(throwing, row)).toBe(false);
  });
});

describe("summarizeByTrade", () => {
  it("rolls up by trade, worst first, with the most common failing criteria", () => {
    const r = (trade: string, kind: QualityLogRow["event_kind"], score: number, passed: boolean, failures: string[]) =>
      ({ trade_slug: trade, event_kind: kind, score, passed, failures: failures.map((criterion) => ({ criterion, score: null, sections: [] })) });
    const out = summarizeByTrade([
      r("roofing", "build_score", 90, true, []), r("roofing", "publish_check", 70, false, ["images"]),
      r("dentist", "build_score", 50, false, ["lead_capture", "images"]), r("dentist", "publish_check", 60, false, ["images"]),
      r("dentist", "gate_attempt", 40, false, ["ignored_attempt_noise"]),
    ]);
    expect(out.map((t) => t.trade)).toEqual(["dentist", "roofing"]);
    expect(out[0]).toMatchObject({ avgScore: 55, passRate: 0, publishChecks: 1, publishBlocked: 1 });
    expect(out[0]!.topFailures[0]).toEqual({ criterion: "images", count: 2 });
    expect(out[0]!.topFailures.map((f) => f.criterion)).not.toContain("ignored_attempt_noise");
    expect(out[1]).toMatchObject({ avgScore: 80, passRate: 0.5 });
  });
});

describe("migration", () => {
  const sql = readFileSync("supabase/migrations/20261031190000_builder_quality_log.sql", "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  it("is additive only", () => {
    expect(code).not.toMatch(/\bdrop\s+(table|column|index|schema)\b|\brename\b|\balter\s+table\s+(?!public\.builder_quality_log\s+enable)|\bdelete\s+from\b|\btruncate\b/i);
    expect(code).toMatch(/create table if not exists public\.builder_quality_log/);
  });
  it("turns on RLS, lets only super admins read and gives the service role the writes", () => {
    expect(code).toMatch(/alter table public\.builder_quality_log enable row level security/);
    const policies = code.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/for select/);
    expect(policies[0]).toMatch(/using \(private\.is_super_admin\(\)\)/);
    expect(policies[0]).not.toMatch(/can_manage_org|is_org_member|true/);
    expect(code).toMatch(/revoke all on public\.builder_quality_log from anon/);
    expect(code).toMatch(/revoke insert, update, delete on public\.builder_quality_log from authenticated/);
    expect(code).toMatch(/grant all on public\.builder_quality_log to service_role/);
  });

  it("stores hard phone-check blockers as failure entries, with no schema change", () => {
    const attempt = { attempt: 0, score: 40, rawScore: 90, passed: false, capped: null, blockers: ["debug_overlay"], failures: [], regenerated: [], roles: { check: "fast", regenerate: [] } };
    expect(gateAttemptRow(common, attempt as never, 85).failures).toEqual([{ criterion: "blocker:debug_overlay", score: 0, sections: [] }]);
    expect(publishCheckRow(common, { score: 40, bar: 85, passed: false, mode: "enforce", failures: ["mobile_390"], blockers: ["no_content"] }).failures.map((f) => f.criterion)).toEqual(["mobile_390", "blocker:no_content"]);
  });
});
