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
