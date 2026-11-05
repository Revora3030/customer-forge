import { NOT_MEASURED, capLevel, formatRate, metricExplainer, type CityMetrics as Metrics, type MetricKey } from "@/lib/ai-city-metrics";

const usd = (v: number) => `$${v.toFixed(2)}`;

/** Measured values only. Anything unreadable or without records says "not measured yet". */
export function CityMetrics({ metrics, error }: { metrics: Metrics | undefined; error?: boolean }) {
  const m = error ? undefined : metrics;
  const spend = m?.paidSpend;
  const causes = m?.failuresByCause;
  const cap = capLevel(spend);
  return <section aria-label="Measured build metrics" className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border pb-4 sm:grid-cols-4">
    <Cell metric="queued" m={m} label="Queued builds" value={m?.queuedBuilds == null ? NOT_MEASURED : String(m.queuedBuilds)} />
    <Cell metric="success" m={m} label={`Build success, last ${m?.success?.windowDays ?? 7} days`} value={formatRate(m?.success ?? null)} note={m?.success ? `${m.success.succeeded} completed · ${m.success.failed} failed` : undefined} />
    <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{`Failures by cause, last ${m?.success?.windowDays ?? 7} days`}</p>{causes && causes.length ? <ul className="mt-1 space-y-0.5 text-sm">{causes.map(c => <li key={c.cause}><span className="font-semibold">{c.count}</span> {c.cause}</li>)}</ul> : <p className="mt-1 text-sm">{causes ? "0 failures recorded" : NOT_MEASURED}</p>}<Explain metric="failures" m={m} /></div>
    <Cell metric="spend" m={m} tone={cap && cap.level !== "ok" ? cap : undefined} label={spend ? `Paid AI today (${spend.day} UTC)` : "Paid AI today"} value={spend ? `${usd(spend.settledUsd)} of ${usd(spend.capUsd)} cap` : NOT_MEASURED} note={spend && spend.openUsd > 0 ? `+ ${usd(spend.openUsd)} reserved, not yet settled` : undefined} />
  </section>;
}

function Cell({ label, value, note, metric, m, tone }: { label: string; value: string; note?: string | undefined; metric: MetricKey; m: Metrics | undefined; tone?: { level: "ok" | "warn" | "full"; label: string } | undefined }) {
  const toneClass = tone?.level === "full" ? "text-destructive" : tone?.level === "warn" ? "text-amber-600 dark:text-amber-400" : "";
  return <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className={`mt-1 break-words font-display text-lg font-semibold ${toneClass}`}>{value}</p>{tone ? <p role="status" data-cap-level={tone.level} className={`text-[11px] font-medium ${toneClass}`}>{tone.label}</p> : null}{note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}<Explain metric={metric} m={m} /></div>;
}

function Explain({ metric, m }: { metric: MetricKey; m: Metrics | undefined }) {
  return <details className="mt-1 text-[11px] text-muted-foreground"><summary className="cursor-pointer select-none underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">How this is measured</summary><p className="mt-1 max-w-prose">{metricExplainer(metric, m)}</p></details>;
}
