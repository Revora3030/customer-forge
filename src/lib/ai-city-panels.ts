/**
 * JC-25 / JC-26 / JC-27 district panels: pure shaping only. Every number comes
 * from a recorded row; a read that failed is `null` ("—" / "unavailable"),
 * never zero, and missing evidence is never shown as a pass. Nothing here
 * writes, sends or edits anything.
 */

// ---------------------------------------------------------------- JC-25 Growth

export type FunnelStageInput = { key: string; count: number | null; rate: number | null };
export type FunnelWindowInput = { days: number; stages?: readonly FunnelStageInput[]; unavailable?: readonly string[] } | null;

export const FUNNEL_STEPS = [
  { key: "visitors", label: "Visitors" },
  { key: "accounts", label: "Accounts" },
  { key: "trials", label: "Trials" },
  { key: "paid", label: "Paid" },
] as const;
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]["key"];

export type FunnelStep = { key: FunnelStepKey; label: string; count: number | null; rate: number | null };
export type FunnelWindow = { days: number; available: boolean; steps: FunnelStep[] };

export type GrowthFunnel = {
  windows: FunnelWindow[];
  /** prospect_inbound rows by state; null = unreadable. */
  inbox: { total: number | null; needsReview: number | null; unprocessed: number | null };
  /** Prospect demos found / ready, from the sales pipeline reads. */
  demos: { found: number | null; ready: number | null };
  /** Drafts waiting for the owner: queued approvals plus reply drafts. */
  waiting: { approvals: number | null; replyDrafts: number | null };
  checkedAt: string;
};

const nonNegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

export function summariseFunnelWindow(input: FunnelWindowInput, days: number): FunnelWindow {
  const steps: FunnelStep[] = FUNNEL_STEPS.map((step) => {
    const found = input?.stages?.find((stage) => stage.key === step.key);
    return { key: step.key, label: step.label, count: nonNegative(found?.count), rate: typeof found?.rate === "number" && Number.isFinite(found.rate) ? found.rate : null };
  });
  const available = Boolean(input?.stages?.length) && steps.some((step) => step.count !== null);
  return { days, available, steps };
}

export function buildGrowthFunnel(input: {
  funnel7: FunnelWindowInput;
  funnel30: FunnelWindowInput;
  inboxTotal: number | null;
  inboxNeedsReview: number | null;
  inboxUnprocessed: number | null;
  demosFound: number | null;
  demosReady: number | null;
  approvals: number | null;
  checkedAt: string;
}): GrowthFunnel {
  return {
    windows: [summariseFunnelWindow(input.funnel7, 7), summariseFunnelWindow(input.funnel30, 30)],
    inbox: { total: nonNegative(input.inboxTotal), needsReview: nonNegative(input.inboxNeedsReview), unprocessed: nonNegative(input.inboxUnprocessed) },
    demos: { found: nonNegative(input.demosFound), ready: nonNegative(input.demosReady) },
    waiting: { approvals: nonNegative(input.approvals), replyDrafts: nonNegative(input.inboxNeedsReview) },
    checkedAt: input.checkedAt,
  };
}

/** "12", or "—" when the read failed (never a zero). */
export function countLabel(value: number | null): string {
  return value === null ? "—" : String(value);
}

// ------------------------------------------------------------ JC-26 Reliability

export const RELEASE_WORKFLOWS = ["Revora Quality Gate", "Revora Security Gate", "Revora Browser QA"] as const;

export type ReleaseRunInput = {
  name: string;
  status: string;
  conclusion: string | null;
  commit: string | null;
  url: string | null;
  updatedAt?: string | null;
};
export type ReleaseEvidenceInput = {
  status: string;
  branchHeadCommit: string | null;
  runs: readonly ReleaseRunInput[];
  checkedAt?: string;
  reason?: string;
} | null;

export type ReleaseVerdict = "passed" | "failed" | "running" | "missing" | "other_commit";
export type ReleaseCheck = { name: string; verdict: ReleaseVerdict; url: string | null; at: string | null };

/**
 * A workflow counts as passed only when it completed successfully on the exact
 * current commit. No run, or a run on an older commit, is never a pass.
 */
export function releaseVerdict(run: ReleaseRunInput | undefined, head: string | null): ReleaseVerdict {
  if (!run || !head) return "missing";
  if (!run.commit || run.commit.toLowerCase() !== head.toLowerCase()) return "other_commit";
  if (run.status !== "completed") return "running";
  return run.conclusion === "success" ? "passed" : "failed";
}

export type ErrorGroupInput = { key: string; label: string; count: number; ageMs: number };
/** Open error groups (#562 grouping, 48 hours) as the inspector already computed them; null = feed unreadable. */
export type ErrorGroupsInput = { count: number; capped: boolean; groups: readonly ErrorGroupInput[] } | null;
export function errorGroupsLine(errors: ErrorGroupsInput | undefined): string {
  if (!errors) return "Error groups unavailable: the error feed could not be read.";
  if (!errors.groups.length) return "No open error groups in the last 48 hours.";
  const n = errors.groups.length;
  return `${n} open error group${n === 1 ? "" : "s"} · ${errors.count}${errors.capped ? "+" : ""} failures in the last 48 hours.`;
}

export type ContractProbeInput = { table: string; status: "unavailable" | "query_contract_accepted"; code: string | null };

export type ReleaseBoard = {
  ci: {
    /** False when GitHub could not be read at all. */
    readable: boolean;
    head: string | null;
    checks: ReleaseCheck[];
    reason: string | null;
  };
  tenantIsolation: { state: "passed" | "failed" | "not_recorded"; detail: string };
  contracts: { probed: boolean; accepted: number; failed: number; failedTables: string[]; checkedAt: string | null };
  checkedAt: string;
};

export function buildReleaseBoard(input: {
  evidence: ReleaseEvidenceInput;
  contracts: readonly ContractProbeInput[] | null;
  tenantIsolation?: "passed" | "failed" | null;
  checkedAt: string;
}): ReleaseBoard {
  const evidence = input.evidence;
  const head = evidence?.branchHeadCommit && /^[a-f0-9]{40}$/i.test(evidence.branchHeadCommit) ? evidence.branchHeadCommit : null;
  const runs = evidence?.runs ?? [];
  const checks: ReleaseCheck[] = RELEASE_WORKFLOWS.map((name) => {
    const run = runs.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    return { name, verdict: releaseVerdict(run, head), url: run?.url ?? null, at: run?.updatedAt ?? null };
  });
  const failedProbes = (input.contracts ?? []).filter((probe) => probe.status !== "query_contract_accepted");
  const iso = input.tenantIsolation ?? null;
  return {
    ci: { readable: Boolean(evidence) && Boolean(head), head, checks, reason: evidence ? (head ? null : evidence.reason ?? "The current commit could not be read.") : "CI evidence could not be read." },
    tenantIsolation: iso
      ? { state: iso, detail: iso === "passed" ? "Recorded as passed." : "Recorded as failed." }
      : { state: "not_recorded", detail: "No tenant-isolation result is recorded anywhere yet, so none is shown." },
    contracts: {
      probed: input.contracts !== null,
      accepted: (input.contracts ?? []).length - failedProbes.length,
      failed: failedProbes.length,
      failedTables: failedProbes.map((probe) => probe.table),
      checkedAt: input.contracts === null ? null : input.checkedAt,
    },
    checkedAt: input.checkedAt,
  };
}

export const VERDICT_LABEL: Record<ReleaseVerdict, string> = {
  passed: "Passed",
  failed: "Failed",
  running: "Running",
  missing: "No evidence",
  other_commit: "Only an older commit",
};

// ------------------------------------------------------------ JC-27 Knowledge

/** A saved note not touched for this long is listed as stale (never removed). */
export const MEMORY_STALE_DAYS = 90;

export type MemoryRowInput = { updated_at: string | null; created_at?: string | null };
export type MemoryHealth = {
  /** Saved owner notes (jarvis_memories for the signed-in owner). Null = unreadable. */
  saved: number | null;
  stale: number | null;
  staleDays: number;
  /** Notes a newer note replaced; null when the column is not readable yet. */
  replaced: number | null;
  /** No contradiction detector records anything yet, so this is "not recorded", never 0. */
  contradictions: { recorded: false; flagged: null };
  /** Memory manager (JC-41) route, or null while it does not exist. */
  managerRoute: string | null;
  checkedAt: string;
};

/** JC-41 is not built. Flip this to the sheet's route when it lands. */
export const MEMORY_MANAGER_ROUTE: string | null = null;

export function staleCutoff(now: number, staleDays = MEMORY_STALE_DAYS): string {
  return new Date(now - staleDays * 86_400_000).toISOString();
}

export function isStale(row: MemoryRowInput, now: number, staleDays = MEMORY_STALE_DAYS): boolean {
  const at = Date.parse(row.updated_at ?? row.created_at ?? "");
  return Number.isFinite(at) && now - at > staleDays * 86_400_000;
}

export function buildMemoryHealth(input: {
  saved: number | null;
  stale: number | null;
  replaced: number | null;
  checkedAt: string;
  managerRoute?: string | null;
}): MemoryHealth {
  return {
    saved: nonNegative(input.saved),
    stale: input.saved === null ? null : nonNegative(input.stale),
    staleDays: MEMORY_STALE_DAYS,
    replaced: nonNegative(input.replaced),
    contradictions: { recorded: false, flagged: null },
    managerRoute: input.managerRoute === undefined ? MEMORY_MANAGER_ROUTE : input.managerRoute,
    checkedAt: input.checkedAt,
  };
}
