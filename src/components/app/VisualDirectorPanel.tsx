import type { VisualDirection } from '@/lib/builder/visual-director';

type VisualDirectorPanelProps = {
  direction: VisualDirection;
  onUseBrief?: (briefIndex: number) => void;
  className?: string;
};

const placementLabel = {
  hero: 'Hero visual',
  proof: 'Trust visual',
  service: 'Service visual',
  cta: 'CTA visual',
} as const;

export function VisualDirectorPanel({ direction, onUseBrief, className = '' }: VisualDirectorPanelProps) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="visual-director-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">AI visual director</p>
          <h2 id="visual-director-title" className="mt-1 text-xl font-semibold tracking-tight">{direction.mood} visual direction</h2>
          <p className="mt-1 text-sm text-muted-foreground">A practical creative system for a website that looks intentional on every screen.</p>
        </div>
        <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">{direction.mood}</span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Typography</dt>
          <dd className="mt-1 text-sm leading-6">{direction.typeStyle}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Page composition</dt>
          <dd className="mt-1 text-sm leading-6">{direction.composition}</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Hero treatment</p>
        <p className="mt-1 text-sm leading-6">{direction.heroTreatment}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[['Mobile', direction.mobileRule], ['Accessibility', direction.accessibilityRule], ['Performance', direction.performanceRule]].map(([label, rule]) => (
          <div key={label} className="rounded-xl border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm leading-6">{rule}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">Creative asset plan</h3>
          <span className="text-xs text-muted-foreground">Canva-ready briefs</span>
        </div>
        <div className="mt-3 grid gap-3">
          {direction.assetBriefs.map((brief, index) => (
            <article key={`${brief.placement}-${brief.aspectRatio}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">{placementLabel[brief.placement]}</h4>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-muted-foreground">{brief.aspectRatio}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{brief.purpose}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Alt text:</span> {brief.altTextGuidance}</p>
              {onUseBrief ? (
                <button type="button" onClick={() => onUseBrief(index)} className="mt-3 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                  Use this brief
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
