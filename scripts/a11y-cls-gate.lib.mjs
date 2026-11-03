/**
 * Pure helpers for scripts/a11y-cls-gate.mjs (no browser needed, so the
 * contract test can prove them): CLS from layout-shift entries, which axe
 * violations block, and the pass/fail verdict.
 */

/** Session-window CLS (web-vitals definition): shifts < 1 s apart, window <= 5 s; worst window wins. */
export function clsFromShifts(entries) {
  let worst = 0;
  let windowValue = 0;
  let windowStart = -Infinity;
  let last = -Infinity;
  for (const e of [...entries].sort((a, b) => a.startTime - b.startTime)) {
    if (e.hadRecentInput) continue;
    if (e.startTime - last < 1000 && e.startTime - windowStart < 5000) {
      windowValue += e.value;
    } else {
      windowValue = e.value;
      windowStart = e.startTime;
    }
    last = e.startTime;
    worst = Math.max(worst, windowValue);
  }
  return Math.round(worst * 10_000) / 10_000;
}

export const BLOCKING_IMPACTS = new Set(["critical", "serious"]);
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export const CLS_BUDGET = 0.1;

/**
 * Splits axe violations into blocking (critical/serious, not allowlisted) and
 * reported. Allowlist ids are "<route>:<rule>" or "*:<rule>".
 */
export function classifyViolations(route, violations, allow = new Set()) {
  const blocking = [];
  const reported = [];
  for (const v of violations) {
    const accepted = allow.has(`${route}:${v.id}`) || allow.has(`*:${v.id}`);
    (BLOCKING_IMPACTS.has(v.impact) && !accepted ? blocking : reported).push({ ...v, accepted });
  }
  return { blocking, reported };
}

/** Verdict for one route measurement. */
export function judgeRoute({ route, cls, violations, error }, { budget = CLS_BUDGET, allow = new Set() } = {}) {
  if (error) return { route, ok: false, reasons: [`load: ${error}`], cls: null, blocking: [], reported: [] };
  const { blocking, reported } = classifyViolations(route, violations, allow);
  const reasons = [];
  if (cls > budget) reasons.push(`CLS ${cls} > ${budget}`);
  for (const v of blocking) reasons.push(`axe ${v.impact} ${v.id}: ${v.help} (${v.nodes} elements)`);
  return { route, ok: reasons.length === 0, reasons, cls, blocking, reported };
}

export function parseRoutes(value, fallback) {
  const routes = String(value ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("/"));
  return routes.length ? [...new Set(routes)] : fallback;
}
