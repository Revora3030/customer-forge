import type { LaunchQualityDimension, LaunchQualityReport } from '@/lib/builder/launch-quality-gate';
import { Button } from '@/components/ui/button';

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
  not_ready: 'border-destructive/30 bg-destructive/10 text-destructive',
  needs_work: 'border-accent/30 bg-accent/10 text-accent',
  launch_ready: 'border-primary/30 bg-primary/10 text-foreground',
  excellent: 'border-primary/30 bg-primary/10 text-foreground',
};

export function LaunchQualityCard({ report, onImprove, className = '' }: LaunchQualityCardProps) {
  const nextAction = report.nextAction;

  return (
    <section className={`border-t border-border py-5 ${className}`} aria-labelledby="launch-quality-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Launch readiness review</p>
          <h2 id="launch-quality-title" className="mt-1 text-xl font-semibold tracking-tight">Measured launch readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">This score covers configured content and completed checks. It is not a subjective visual-design rating.</p>
        </div>
        <div className={`rounded-md border px-3 py-2 text-right ${gradeTone[report.grade]}`}>
          <p className="text-3xl font-bold leading-none">{report.score}<span className="text-base font-medium">/100</span></p>
          <p className="mt-1 text-xs font-semibold">{gradeLabel[report.grade]}</p>
        </div>
      </div>

      {nextAction ? (
        <div className="mt-5 border-l-2 border-primary pl-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Highest-impact next step</p>
          <h3 className="mt-1 font-semibold">{nextAction.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{nextAction.recommendation}</p>
          {onImprove ? (
            <Button type="button" variant="signal" onClick={() => onImprove(nextAction.dimension)} className="mt-3">
              Improve this with AI
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 border-l-2 border-primary pl-4 text-sm text-foreground">
          The recorded readiness checks meet their targets. Complete the screen and interaction checks before publishing.
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Passed quality checks">
        {report.passed.map((dimension) => (
          <span key={dimension} className="border-b border-border px-1 py-1 text-xs capitalize text-muted-foreground">
            {dimension.replace('_', ' ')} ready
          </span>
        ))}
      </div>
    </section>
  );
}
