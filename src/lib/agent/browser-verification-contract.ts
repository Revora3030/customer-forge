export type BrowserViewport = "desktop" | "tablet" | "mobile";
export type BrowserEvidenceKind = "snapshot" | "screenshot" | "console" | "network" | "navigation" | "form" | "a11y";
export interface BrowserCheck { id: string; viewport: BrowserViewport; kind: BrowserEvidenceKind; required: boolean; description: string; }
export interface BrowserVerificationPlan { checks: BrowserCheck[]; maxPages: number; maxActions: number; readOnly: boolean; }
const kinds: BrowserEvidenceKind[] = ["snapshot","screenshot","console","network","navigation","form","a11y"];
export function createBrowserVerificationPlan(routes: string[], maxPages = 12): BrowserVerificationPlan {
  const selected = [...new Set(routes.filter(Boolean).map(r => r.startsWith("/") ? r : "/" + r))].slice(0, maxPages);
  const checks: BrowserCheck[] = [];
  for (const route of selected) for (const viewport of ["desktop","mobile"] as BrowserViewport[]) for (const kind of kinds)
    checks.push({ id: route + ":" + viewport + ":" + kind, viewport, kind, required: kind === "navigation" || kind === "console" || kind === "a11y", description: kind + " evidence for " + route + " at " + viewport });
  return { checks, maxPages: selected.length, maxActions: Math.max(20, selected.length * 12), readOnly: true };
}
export function browserPlanIsBounded(plan: BrowserVerificationPlan): boolean {
  return plan.maxPages <= 12 && plan.maxActions <= 144 && plan.checks.length <= 168;
}
