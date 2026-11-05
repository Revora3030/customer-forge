/** Owner-dashboard money numbers, kept honest: they are lead estimates, not collected revenue. */
type LeadValue = { estimated_value?: number | string | null };

const positive = (l: LeadValue) => {
  const n = Number(l.estimated_value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Average over leads that actually carry an estimate; leads without one are not counted as $0 jobs. */
export function averageEstimate(leads: readonly LeadValue[]): { value: number; count: number } {
  const values = leads.map(positive).filter((n) => n > 0);
  return {
    value: values.length ? values.reduce((s, n) => s + n, 0) / values.length : 0,
    count: values.length,
  };
}

/** Visitor-to-lead conversion as text; "—" when there were no visitors, so no data never reads as a measured 0%. */
export function conversionLabel(leads: number, views: number): string {
  return views > 0 ? `${((leads / views) * 100).toFixed(1)}%` : "—";
}
