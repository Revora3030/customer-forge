/**
 * COMPOSITION PREVIEW — the AI's chosen look and page blocks, shown for
 * approval before a single change is written.
 *
 * Nothing here applies anything. It explains the reasoning in one line, shows a
 * live sample of the actual colours and font that will be installed, and lists
 * what each page will contain in order, marking blocks that are new. The owner
 * approves or adjusts using the step list underneath, exactly as before.
 */
import type { CompositionPreview } from "@/lib/builder/composition-preview";

export function CompositionPreviewCard({ composition }: { composition: CompositionPreview }) {
  const { colors, tone } = composition;
  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3">
      <p className="text-[12.5px] font-medium">
        The look Revora chose: {composition.styleName}
        {composition.brandLocked ? " (using your brand colours)" : ""}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">{composition.because}</p>

      {/* Live sample of the real palette and font, not a description of it. */}
      <div
        className="mt-2.5 overflow-hidden rounded-md border border-border"
        style={{ background: colors.secondary }}
      >
        <div className="p-3">
          <p
            className="text-[15px] leading-tight font-semibold"
            style={{ color: colors.primary, fontFamily: `"${composition.font}", system-ui` }}
          >
            Your headline, in {composition.font}
          </p>
          <p
            className="mt-1 text-[11.5px]"
            style={{ color: tone === "dark" ? "#e7e7e7" : "#4b4b4b" }}
          >
            {composition.mood}
          </p>
          <span
            className="mt-2 inline-block rounded-md px-2.5 py-1 text-[11.5px] font-medium"
            style={{ background: colors.accent, color: tone === "dark" ? "#0b0b0b" : "#ffffff" }}
          >
            Get in touch
          </span>
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt>Pages</dt>
          <dd className="text-foreground">{tone === "dark" ? "Dark" : "Light"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Font</dt>
          <dd className="text-foreground">
            {composition.font} ({composition.fontNote})
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Colours</dt>
          <dd className="flex items-center gap-1">
            {[colors.primary, colors.secondary, colors.accent].map((value) => (
              <span
                key={value}
                title={value}
                className="inline-block size-3.5 rounded-full border border-border"
                style={{ background: value }}
              />
            ))}
          </dd>
        </div>
      </dl>

      {composition.pages.length ? (
        <div className="mt-2.5 space-y-2">
          <p className="text-[12px] font-medium">How each page will be put together</p>
          {composition.pages.map((page) => (
            <div key={page.pageId}>
              <p className="text-[11.5px] font-medium text-muted-foreground">{page.title}</p>
              <ol className="mt-1 flex flex-wrap items-center gap-1">
                {page.blocks.map((block, index) => (
                  <li
                    key={`${page.pageId}-${block}-${index}`}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px]"
                  >
                    {index + 1}. {block}
                    {page.added.includes(block) ? (
                      <span className="ml-1 text-primary">new</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[11px] text-muted-foreground">
        Nothing is applied yet. Keep, skip or reorder the steps below, then press the button to
        apply — your wording and business details are never changed by this.
      </p>
    </div>
  );
}
