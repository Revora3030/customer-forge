import { splitRecommendations, type EvidenceLinkedRecommendation } from '@/lib/builder/actionable-recommendations';

type RecommendationReviewQueueProps = {
  recommendations: EvidenceLinkedRecommendation[];
  onReview?: (recommendation: EvidenceLinkedRecommendation) => void;
  onResolveEvidence?: (recommendation: EvidenceLinkedRecommendation) => void;
  className?: string;
};

export function RecommendationReviewQueue({ recommendations, onReview, onResolveEvidence, className = '' }: RecommendationReviewQueueProps) {
  const { actionable, held } = splitRecommendations(recommendations);
  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="recommendation-queue-title">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Controlled AI actions</p><h2 id="recommendation-queue-title" className="mt-1 text-xl font-semibold tracking-tight">Recommendation review queue</h2><p className="mt-1 text-sm text-muted-foreground">Only evidence-backed recommendations can enter your site-change review flow.</p></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Ready for review</h3><span className="text-xs text-emerald-300">{actionable.length}</span></div><ul className="mt-3 space-y-3">{actionable.map(({ recommendation }) => <li key={recommendation.id} className="rounded-lg border border-white/10 bg-card p-3"><p className="text-sm font-semibold">{recommendation.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{recommendation.rationale}</p>{onReview ? <button type="button" onClick={() => onReview(recommendation)} className="mt-3 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">Review proposed change</button> : null}</li>)}</ul>{actionable.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No evidence-backed recommendations are ready yet.</p> : null}</div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Held for evidence</h3><span className="text-xs text-amber-200">{held.length}</span></div><ul className="mt-3 space-y-3">{held.map(({ recommendation, holdReasons }) => <li key={recommendation.id} className="rounded-lg border border-white/10 bg-card p-3"><p className="text-sm font-semibold">{recommendation.title}</p>{holdReasons.map((reason) => <p key={reason} className="mt-1 text-xs leading-5 text-muted-foreground">{reason}</p>)}{onResolveEvidence ? <button type="button" onClick={() => onResolveEvidence(recommendation)} className="mt-3 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold">Resolve evidence</button> : null}</li>)}</ul>{held.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">All recommendations have credible linked evidence.</p> : null}</div>
      </div>
    </section>
  );
}
