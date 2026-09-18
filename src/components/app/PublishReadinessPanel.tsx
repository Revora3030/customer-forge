import { canPublish, createPrepublishChecklist, type PublishEvidence } from '@/lib/builder/prepublish-checklist';

type PublishReadinessPanelProps = {
  evidence: PublishEvidence;
  onReviewCheck?: (id: keyof PublishEvidence) => void;
  onPublish?: () => void;
  className?: string;
};

export function PublishReadinessPanel({ evidence, onReviewCheck, onPublish, className = '' }: PublishReadinessPanelProps) {
  const checks = createPrepublishChecklist(evidence);
  const ready = canPublish(evidence);
  const completeCount = checks.filter((check) => check.complete).length;

  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="publish-readiness-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Launch quality gate</p><h2 id="publish-readiness-title" className="mt-1 text-xl font-semibold tracking-tight">Publish readiness</h2><p className="mt-1 text-sm text-muted-foreground">{completeCount} of {checks.length} customer-facing checks verified.</p></div>
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${ready ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>{ready ? 'Ready to publish' : 'Publishing blocked'}</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completeCount / checks.length) * 100}%` }} /></div>
      <ul className="mt-5 space-y-3">
        {checks.map((check) => <li key={check.id} className="flex gap-3 rounded-xl border border-white/10 p-3"><span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${check.complete ? 'bg-emerald-400 text-black' : 'bg-white/10 text-muted-foreground'}`}>{check.complete ? '✓' : '!'}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{check.label}</p>{!check.complete ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.guidance}</p> : <p className="mt-1 text-xs text-emerald-300">Evidence verified</p>}</div>{onReviewCheck && !check.complete ? <button type="button" onClick={() => onReviewCheck(check.id)} className="self-start rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold">Review</button> : null}</li>)}
      </ul>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs text-muted-foreground">Publishing is unlocked only when the checklist is complete.</p>{onPublish ? <button type="button" disabled={!ready} onClick={onPublish} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Publish site</button> : null}</div>
    </section>
  );
}
