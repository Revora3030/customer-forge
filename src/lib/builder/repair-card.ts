/**
 * B12-1 SELF-REPAIR STREAM CARD — pure data for the builder chat card.
 *
 * The card is drawn ONLY from the post-apply QA loop's measured result
 * (qa-loop.server.ts: check → safe repair → check again). It never invents
 * anything:
 *   - no repair attempted → no card (a clean check is not an "event");
 *   - the checks could not run → no card (nothing was found or fixed);
 *   - a repair the re-check still finds, or one the database refused, is
 *     shown as NOT fixed and the owner is offered a restore point.
 * Only the QA loop's own short, owner-readable finding lines are shown —
 * never model reasoning.
 */

/** The measured shape the apply step returns (subset of QaLoopResult). */
export type RepairPass = { score: number; findings: number; notes: string[] };
export type RepairEvent = {
  checked: boolean;
  before: RepairPass;
  after: RepairPass;
  /** Written AND gone on the re-check. */
  repaired: string[];
  /** Written, but the re-check still finds it. */
  unresolved: string[];
  /** The database refused the write. */
  failed: string[];
  /** Real findings that are not safe to fix automatically. */
  reported: string[];
};

export type RepairVerdict = "verified" | "recheck_failed";
export type RepairCard = {
  verdict: RepairVerdict;
  found: string[];
  fixed: string[];
  stillThere: string[];
  notApplied: string[];
  leftForYou: string[];
  findingsBefore: number;
  findingsAfter: number;
  /** True when the re-check did not confirm every repair: offer the restore point. */
  offerRestore: boolean;
};

const MAX_LINES = 8;
const MAX_CHARS = 200;

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push(text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function pass(value: unknown): RepairPass {
  const v = (value && typeof value === "object" ? value : {}) as {
    score?: unknown;
    findings?: unknown;
    notes?: unknown;
  };
  return { score: count(v.score), findings: count(v.findings), notes: lines(v.notes) };
}

/**
 * Reads an apply result's `qa` (or a saved copy) into the bounded event the
 * chat keeps. Anything that is not a real repair event returns null.
 */
export function repairEventFrom(value: unknown): RepairEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as {
    checked?: unknown;
    before?: unknown;
    after?: unknown;
    repaired?: unknown;
    unresolved?: unknown;
    failed?: unknown;
    reported?: unknown;
  };
  if (v.checked !== true) return null;
  const event: RepairEvent = {
    checked: true,
    before: pass(v.before),
    after: pass(v.after),
    repaired: lines(v.repaired),
    unresolved: lines(v.unresolved),
    failed: lines(v.failed),
    reported: lines(v.reported),
  };
  return event.repaired.length || event.unresolved.length || event.failed.length ? event : null;
}

/**
 * One request may apply in several batches, each with its own QA loop. The
 * first check is the "before", the last check is the "after", and every
 * repair outcome is kept.
 */
export function mergeRepairEvents(
  events: ReadonlyArray<RepairEvent | null | undefined>,
): RepairEvent | null {
  const real = events.filter((event): event is RepairEvent => Boolean(event));
  if (!real.length) return null;
  const join = (pick: (event: RepairEvent) => string[]) =>
    lines(Array.from(new Set(real.flatMap(pick))));
  return {
    checked: true,
    before: real[0]!.before,
    after: real[real.length - 1]!.after,
    repaired: join((event) => event.repaired),
    unresolved: join((event) => event.unresolved),
    failed: join((event) => event.failed),
    reported: join((event) => event.reported),
  };
}

export function repairCard(event: RepairEvent | null | undefined): RepairCard | null {
  const real = repairEventFrom(event);
  if (!real) return null;
  const confirmed =
    real.unresolved.length === 0 && real.failed.length === 0 && real.repaired.length > 0;
  const found = real.before.notes.length
    ? real.before.notes
    : [...real.repaired, ...real.unresolved, ...real.failed];
  return {
    verdict: confirmed ? "verified" : "recheck_failed",
    found: lines(found),
    fixed: real.repaired,
    stillThere: real.unresolved,
    notApplied: real.failed,
    leftForYou: real.reported,
    findingsBefore: real.before.findings,
    findingsAfter: real.after.findings,
    offerRestore: !confirmed,
  };
}
