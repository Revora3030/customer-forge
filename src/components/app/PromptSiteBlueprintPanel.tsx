import type { PromptSiteBlueprint } from '@/lib/builder/prompt-site-blueprint';

type PromptSiteBlueprintPanelProps = {
  blueprint: PromptSiteBlueprint;
  onEditPage?: (slug: string) => void;
  onPreview?: () => void;
  className?: string;
};

export function PromptSiteBlueprintPanel({ blueprint, onEditPage, onPreview, className = '' }: PromptSiteBlueprintPanelProps) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-card p-5 shadow-sm ${className}`} aria-labelledby="site-blueprint-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">AI site blueprint</p>
          <h2 id="site-blueprint-title" className="mt-1 text-xl font-semibold tracking-tight">Your site plan, before anything changes</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Review the page structure, customer journey, and conversion plan. Every part stays editable.</p>
        </div>
        <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Preview-first</span>
      </div>

      <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Primary action</p>
        <p className="mt-1 text-lg font-semibold">{blueprint.primaryCta}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{blueprint.valueProposition}</p>
      </div>

      <div className="mt-5">
        <h3 className="font-semibold">Recommended pages</h3>
        <div className="mt-3 grid gap-3">
          {blueprint.pages.map((page) => (
            <article key={page.slug} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="font-medium">{page.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{page.purpose}</p>
                </div>
                {onEditPage ? (
                  <button type="button" onClick={() => onEditPage(page.slug)} className="w-fit rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                    Edit page
                  </button>
                ) : null}
              </div>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${page.title} sections`}>
                {page.sections.map((section) => (
                  <li key={section.id} className="rounded-full border border-white/10 px-2.5 py-1 text-xs capitalize text-muted-foreground">
                    {section.kind}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">SEO title</p>
          <p className="mt-1 text-sm leading-6">{blueprint.seo.title}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">SEO description</p>
          <p className="mt-1 text-sm leading-6">{blueprint.seo.description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Editable plan</span>
        <span aria-hidden="true">•</span>
        <span>Reversible changes</span>
        <span aria-hidden="true">•</span>
        <span>No automatic publishing</span>
        {onPreview ? (
          <button type="button" onClick={onPreview} className="ml-auto rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
            Preview site plan
          </button>
        ) : null}
      </div>
    </section>
  );
}
