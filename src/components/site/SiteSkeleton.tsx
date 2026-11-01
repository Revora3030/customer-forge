import { cn } from "@/lib/utils";

/**
 * The shape of a client website — header, opening hero, a row of cards —
 * shown while a draft or the builder frame is still on its way. It replaces
 * bare "Loading…" lines, so the owner sees the page forming in the same place
 * it will appear. Purely decorative: the one readable line is for screen
 * readers, and the shimmer stops for people who ask for reduced motion.
 */
export function SiteSkeleton({
  label = "Loading your website…",
  compact = false,
  className,
}: {
  /** Announced to screen readers (visually hidden). */
  label?: string;
  /** Phone-sized layout: one column of cards, a shorter hero. */
  compact?: boolean;
  className?: string;
}) {
  const block = "rounded-md bg-muted/70 animate-pulse motion-reduce:animate-none";
  return (
    <div role="status" aria-live="polite" data-testid="site-skeleton" className={cn("flex h-full min-h-full w-full flex-col bg-background", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div className={cn(block, "h-6 w-32")} />
          {compact ? (
            <div className={cn(block, "h-8 w-8 rounded-full")} />
          ) : (
            <div className="flex items-center gap-4">
              <div className={cn(block, "h-3 w-14")} />
              <div className={cn(block, "h-3 w-14")} />
              <div className={cn(block, "h-3 w-14")} />
              <div className={cn(block, "h-9 w-28 rounded-full")} />
            </div>
          )}
        </div>
        <div className={cn("relative mx-4 mt-4 overflow-hidden rounded-xl bg-muted/50", compact ? "h-64" : "h-[22rem]")}>
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/80 via-muted/40 to-muted/80 motion-reduce:animate-none" />
          <div className={cn("absolute flex flex-col gap-3", compact ? "inset-x-5 bottom-6" : "bottom-10 left-10 w-1/2")}>
            <div className="h-3 w-24 rounded bg-background/70" />
            <div className="h-7 w-full rounded bg-background/80" />
            <div className="h-7 w-3/4 rounded bg-background/80" />
            <div className="mt-2 flex gap-3">
              <div className="h-10 w-32 rounded-full bg-background/90" />
              {compact ? null : <div className="h-10 w-28 rounded-full bg-background/60" />}
            </div>
          </div>
        </div>
        <div className={cn("grid gap-4 px-4 py-6", compact ? "grid-cols-1" : "grid-cols-3")}>
          {Array.from({ length: compact ? 2 : 3 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border/60 p-4">
              <div className={cn(block, "h-24 w-full")} />
              <div className={cn(block, "h-4 w-2/3")} />
              <div className={cn(block, "h-3 w-full")} />
              <div className={cn(block, "h-3 w-5/6")} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
