/**
 * Pure helpers for scripts/a11y-cls-gate.mjs (no browser needed, so the
 * contract test can prove them): CLS from layout-shift entries, how IBM
 * Equal Access (accessibility-checker-engine) results are summarized, which
 * of them block, and the pass/fail verdict.
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

/** The engine's WCAG 2.2 A + AA policy. */
export const ACE_POLICIES = ["WCAG_2_2"];
export const CLS_BUDGET = 0.1;
export const DEFAULT_WIDTHS = [320, 1440];

/**
 * Engine result value is [policy level, outcome]. Only a definite failure of a
 * required rule (["VIOLATION", "FAIL"]) blocks. "POTENTIAL" / "MANUAL" outcomes
 * and RECOMMENDATION-level rules need human review and are reported only.
 */
export function aceKind(value) {
  const [level, outcome] = Array.isArray(value) ? value : [];
  if (outcome === "PASS" || outcome === "INFORMATION" || !outcome) return null;
  if (level === "VIOLATION" && outcome === "FAIL") return "violation";
  if (level === "VIOLATION") return "potential";
  return "recommendation";
}

/** Groups raw engine results into one finding per (rule, kind), skipping passes. */
export function summarizeAceResults(results) {
  const byKey = new Map();
  for (const r of results ?? []) {
    const kind = aceKind(r.value);
    if (!kind) continue;
    const key = `${r.ruleId}|${kind}`;
    const entry = byKey.get(key) ?? { id: r.ruleId, kind, help: r.message, nodes: 0, targets: [] };
    entry.nodes += 1;
    const dom = r.path?.dom;
    if (dom && entry.targets.length < 3) entry.targets.push(dom);
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/**
 * Splits findings into blocking (definite violations not allowlisted) and
 * reported. Allowlist ids are "<route>:<rule>", "<route>@<width>:<rule>" or "*:<rule>".
 */
export function classifyViolations(route, findings, allow = new Set(), width = null) {
  const blocking = [];
  const reported = [];
  for (const v of findings) {
    const accepted =
      allow.has(`${route}:${v.id}`) || allow.has(`*:${v.id}`) || (width != null && allow.has(`${route}@${width}:${v.id}`));
    (v.kind === "violation" && !accepted ? blocking : reported).push({ ...v, accepted });
  }
  return { blocking, reported };
}

/** Verdict for one route measurement at one width. */
export function judgeRoute({ route, width = null, cls, violations, error }, { budget = CLS_BUDGET, allow = new Set() } = {}) {
  if (error) return { route, width, ok: false, reasons: [`load: ${error}`], cls: null, blocking: [], reported: [] };
  const { blocking, reported } = classifyViolations(route, violations, allow, width);
  const reasons = [];
  if (cls > budget) reasons.push(`CLS ${cls} > ${budget}`);
  for (const v of blocking) reasons.push(`a11y violation ${v.id}: ${v.help} (${v.nodes} elements)`);
  return { route, width, ok: reasons.length === 0, reasons, cls, blocking, reported };
}

export function parseRoutes(value, fallback) {
  const routes = String(value ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("/"));
  return routes.length ? [...new Set(routes)] : fallback;
}

export function parseWidths(value, fallback = DEFAULT_WIDTHS) {
  const widths = String(value ?? "")
    .split(",")
    .map((w) => Number.parseInt(w.trim(), 10))
    .filter((w) => Number.isInteger(w) && w >= 200 && w <= 3840);
  return widths.length ? [...new Set(widths)] : fallback;
}
