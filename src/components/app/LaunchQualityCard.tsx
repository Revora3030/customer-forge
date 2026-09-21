import type { LaunchQualityDimension, LaunchQualityReport } from '@/lib/builder/launch-quality-gate';

type LaunchQualityCardProps = {
  report: LaunchQualityReport;
  onImprove?: (dimension: LaunchQualityDimension) => void;
  className?: string;
};

const gradeLabel: Record<LaunchQualityReport['grade'], string> = {
  not_ready: 'Not ready to launch',
  needs_work: 'Needs work',
  launch_ready: 'Launch ready',
  excellent: 'Excellent',
};

const gradeTone: Record<LaunchQualityReport['grade'], string> = {
  not_ready: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  needs_work: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  launch_ready: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
  excellent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
};

export function LaunchQualityCard({ report, onImprove, className = '' }: LaunchQualityCardProps) {
  const nextAction = report.nextAction;

  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="launch-quality-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Launch readiness review</p>
          <h2 id="launch-quality-title" className="mt-1 text-xl font-semibold tracking-tight">Measured launch readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">This score covers configured content and completed checks. It is not a subjective visual-design rating.</p>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-right ${gradeTone[report.grade]}`}>
          <p className="text-3xl font-bold leading-none">{report.score}<span className="text-base font-medium">/100</span></p>
          <p className="mt-1 text-xs font-semibold">{gradeLabel[report.grade]}</p>
        </div>
      </div>

      {nextAction ? (
        <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Highest-impact next step</p>
          <h3 className="mt-1 font-semibold">{nextAction.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{nextAction.recommendation}</p>
          {onImprove ? (
            <button type="button" onClick={() => onImprove(nextAction.dimension)} className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
              Improve this with AI
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Your site meets every launch-quality check. Preview it on mobile, then publish with confidence.
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Passed quality checks">
        {report.passed.map((dimension) => (
          <span key={dimension} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs capitalize text-muted-foreground">
            {dimension.replace('_', ' ')} ready
          </span>
        ))}
      </div>
    </section>
  );
}
