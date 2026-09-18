import { prioritizeRecommendations, summarizeOutcomeChange, type ImprovementRecommendation, type OutcomeMetric, type OutcomeSnapshot } from '@/lib/builder/improvement-history';

type OutcomesImprovementPanelProps = {
  baseline: OutcomeSnapshot;
  current: OutcomeSnapshot;
  metrics: OutcomeMetric[];
  recommendations: ImprovementRecommendation[];
  onReviewRecommendation?: (recommendation: ImprovementRecommendation) => void;
  className?: string;
};

export function OutcomesImprovementPanel({ baseline, current, metrics, recommendations, onReviewRecommendation, className = '' }: OutcomesImprovementPanelProps) {
  const prioritized = prioritizeRecommendations(recommendations);
  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="outcomes-improvements-title">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Post-launch learning</p><h2 id="outcomes-improvements-title" className="mt-1 text-xl font-semibold tracking-tight">Outcomes & improvements</h2><p className="mt-1 text-sm text-muted-foreground">Recommendations are ordered by confidence and linked to recorded evidence.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => <article key={metric} className="rounded-xl border border-white/10 p-3"><p className="text-xs font-semibold capitalize text-muted-foreground">{metric.replace(/([A-Z])/g, ' $1')}</p><p className="mt-2 text-sm leading-6">{summarizeOutcomeChange(metric, baseline, current)}</p></article>)}
      </div>
      <div className="mt-6 flex items-center justify-between"><h3 className="text-sm font-semibold">Recommended next improvements</h3><span className="text-xs text-muted-foreground">{prioritized.length} available</span></div>
      <ul className="mt-3 space-y-3">
        {prioritized.map((recommendation) => <li key={recommendation.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{recommendation.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{recommendation.rationale}</p></div><span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold capitalize text-primary">{recommendation.confidence} confidence</span></div><p className="mt-3 text-xs text-muted-foreground">Target: {recommendation.direction} {recommendation.metric.replace(/([A-Z])/g, ' $1')} • {recommendation.evidence.length} evidence signal{recommendation.evidence.length === 1 ? '' : 's'}</p>{onReviewRecommendation ? <button type="button" onClick={() => onReviewRecommendation(recommendation)} className="mt-3 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold">Review recommendation</button> : null}</li>)}
      </ul>
    </section>
  );
}
