import { evaluateEvidenceQuality, type MetricEvidence } from '@/lib/builder/outcome-evidence';

type OutcomeEvidencePanelProps = {
  evidence: MetricEvidence[];
  minimumSampleSize?: number;
  onResolve?: (evidence: MetricEvidence) => void;
  className?: string;
};

export function OutcomeEvidencePanel({ evidence, minimumSampleSize, onResolve, className = '' }: OutcomeEvidencePanelProps) {
  const evaluated = evidence.map((item) => ({ item, quality: evaluateEvidenceQuality(item, minimumSampleSize) }));
  const credibleCount = evaluated.filter(({ quality }) => quality.credible).length;
  const credible = evidence.length > 0 && credibleCount === evidence.length;

  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="outcome-evidence-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recommendation integrity</p><h2 id="outcome-evidence-title" className="mt-1 text-xl font-semibold tracking-tight">Outcome evidence</h2><p className="mt-1 text-sm text-muted-foreground">{credibleCount} of {evidence.length} evidence records meet the credibility standard.</p></div><span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${credible ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>{credible ? 'Recommendation-ready' : 'Evidence needs review'}</span></div>
      <ul className="mt-5 space-y-3">
        {evaluated.map(({ item, quality }) => <li key={`${item.metric}-${item.observedAt}-${item.source}`} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{item.metric.replace(/([A-Z])/g, ' $1')}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{item.source} • {item.sampleSize} observations</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${quality.credible ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>{quality.credible ? 'Credible' : 'Needs attention'}</span></div>{quality.reasons.length > 0 ? <div className="mt-3">{quality.reasons.map((reason) => <p key={reason} className="text-xs leading-5 text-muted-foreground">{reason}</p>)}{onResolve ? <button type="button" onClick={() => onResolve(item)} className="mt-3 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold">Resolve evidence</button> : null}</div> : <p className="mt-3 text-xs text-emerald-300">Source, observation date, sample, and values are valid.</p>}</li>)}
      </ul>
    </section>
  );
}
