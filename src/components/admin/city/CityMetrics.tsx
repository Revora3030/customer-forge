import { NOT_MEASURED, formatRate, type CityMetrics as Metrics } from "@/lib/ai-city-metrics";

const usd = (v: number) => `$${v.toFixed(2)}`;

/** Measured values only. Anything unreadable or without records says "not measured yet". */
export function CityMetrics({ metrics, error }: { metrics: Metrics | undefined; error?: boolean }) {
  const m = error ? undefined : metrics;
  const spend = m?.paidSpend;
  const causes = m?.failuresByCause;
  return <section aria-label="Measured build metrics" className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border pb-4 sm:grid-cols-4">
    <Cell label="Queued builds" value={m?.queuedBuilds == null ? NOT_MEASURED : String(m.queuedBuilds)} />
    <Cell label={`Build success, last ${m?.success?.windowDays ?? 7} days`} value={formatRate(m?.success ?? null)} note={m?.success ? `${m.success.succeeded} completed · ${m.success.failed} failed` : undefined} />
    <div className="min-w-0"><p className="text-[11px] text-muted-foreground">Failures by cause, last 7 days</p>{causes && causes.length ? <ul className="mt-1 space-y-0.5 text-sm">{causes.map(c => <li key={c.cause}><span className="font-semibold">{c.count}</span> {c.cause}</li>)}</ul> : <p className="mt-1 text-sm">{causes ? "0 failures recorded" : NOT_MEASURED}</p>}</div>
    <Cell label={spend ? `Paid AI today (${spend.day} UTC)` : "Paid AI today"} value={spend ? `${usd(spend.settledUsd)} of ${usd(spend.capUsd)} cap` : NOT_MEASURED} note={spend && spend.openUsd > 0 ? `+ ${usd(spend.openUsd)} reserved, not yet settled` : undefined} />
  </section>;
}

function Cell({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words font-display text-lg font-semibold">{value}</p>{note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}</div>;
}
