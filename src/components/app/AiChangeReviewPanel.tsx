import { canApplyChangeSet, summarizeChangeSet, type ReversibleChangeSet } from '@/lib/builder/reversible-change-set';

type AiChangeReviewPanelProps = {
  changeSet: ReversibleChangeSet;
  onPreview?: () => void;
  onApply?: () => void;
  onUndo?: () => void;
  className?: string;
};

export function AiChangeReviewPanel({ changeSet, onPreview, onApply, onUndo, className = '' }: AiChangeReviewPanelProps) {
  const summary = summarizeChangeSet(changeSet);
  const canApply = canApplyChangeSet(changeSet);

  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="ai-change-review-title">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">AI change review</p>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 id="ai-change-review-title" className="text-xl font-semibold tracking-tight">{changeSet.title}</h2><p className="mt-1 text-sm text-muted-foreground">Review the exact changes before they affect your site.</p></div>
        <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">{changeSet.status}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Created', summary.created], ['Updated', summary.updated], ['Moved', summary.moved], ['Removed', summary.deleted]].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-white/10 p-3"><p className="text-2xl font-semibold">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}
      </div>
      <ul className="mt-5 space-y-2">
        {changeSet.changes.map((change) => <li key={change.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm"><span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-xs capitalize">{change.operation}</span>{change.summary}</li>)}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {onPreview ? <button type="button" onClick={onPreview} className="rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary">Preview changes</button> : null}
        {onApply ? <button type="button" disabled={!canApply} onClick={onApply} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Apply reviewed changes</button> : null}
        {onUndo && changeSet.status === 'applied' ? <button type="button" onClick={onUndo} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold">Undo changes</button> : null}
        <p className="ml-auto text-xs text-muted-foreground">Preview required • Reversible</p>
      </div>
    </section>
  );
}
