/**
 * Readable plan + subscription text for screens that would otherwise print raw
 * database values such as "growth_monthly · trialing" or "No plan · ".
 */
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Free first month",
  past_due: "Payment past due",
  unpaid: "Payment past due",
  canceled: "Canceled",
  cancelled: "Canceled",
  incomplete: "Not finished",
  incomplete_expired: "Not finished",
  paused: "Paused",
};

function humanize(value: string): string {
  const words = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

export function planLabel(planId: string | null | undefined, status: string | null | undefined): string {
  const plan = planId?.trim() ? humanize(planId) : "No plan yet";
  const key = status?.trim().toLowerCase() ?? "";
  const state = key ? (STATUS_LABELS[key] ?? humanize(key)) : "";
  return state ? `${plan} · ${state}` : plan;
}
