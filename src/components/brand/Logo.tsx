import { cn } from "@/lib/utils";

// Display-sized copy of the uploaded mark (158x144). The original upload is a
// 1.2 MB 1312px PNG — shipping that for a 36px badge cost every page over a
// megabyte of image bytes, which is the single biggest Core Web Vitals drag on
// the marketing pages.
const MARK_SRC = "/revora-mark-144.png";

/** Revora gold "R" mark — favicon / app icon / dashboard safe. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "group/mark relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px]",
        "border border-primary/50 bg-elevated",
        "shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gold)_18%,transparent),0_0_22px_-6px_var(--color-gold),0_10px_26px_-16px_oklch(0_0_0_/_0.9)]",
        className,
      )}
    >
      {/* colour bloom behind the mark — gold with cool support tones */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(70%_70%_at_25%_15%,color-mix(in_oklab,var(--color-gold)_28%,transparent),transparent_70%),radial-gradient(60%_60%_at_85%_85%,color-mix(in_oklab,var(--color-info)_22%,transparent),transparent_70%)]"
      />
      <img
        src={MARK_SRC}
        alt="Revora"
        width={158}
        height={144}
        className="relative size-full object-contain drop-shadow-[0_2px_6px_color-mix(in_oklab,var(--color-gold)_35%,transparent)]"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
      {/* glass sheen */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:linear-gradient(140deg,rgb(255_255_255_/_0.22)_0%,transparent_42%)]"
      />
    </span>
  );
}

export function Logo({
  className,
  wordmark = true,
  tagline = false,
}: {
  className?: string;
  wordmark?: boolean;
  tagline?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {wordmark ? (
        <span className="flex flex-col leading-none">
          <span className="font-display bg-[linear-gradient(100deg,var(--color-gold-deep),var(--color-gold)_40%,var(--color-gold-soft)_60%,var(--color-gold))] bg-clip-text text-[16px] font-bold tracking-[0.16em] text-transparent">
            REVORA
          </span>
          {tagline ? (
            <span className="mt-1 text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
              The Business Growth Operating System
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
