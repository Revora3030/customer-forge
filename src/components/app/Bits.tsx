import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/domain";

const toneClasses: Record<Tone, string> = {
  signal: "bg-primary/12 text-primary border-primary/35",
  attention: "bg-accent/12 text-accent border-accent/35",
  info: "bg-info/12 text-info border-info/35",
  neutral: "bg-elevated text-muted-foreground border-border",
  danger: "bg-destructive/12 text-destructive border-destructive/35",
};

export function Pill({
  tone = "neutral",
  children,
  className,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Show a status dot before the label. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <Dot tone={tone} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Gold key-information label — use for the most important fact in a block. */
export function KeyLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.1em] text-primary uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "signal" }: { tone?: Tone }) {
  const map: Record<Tone, string> = {
    signal: "bg-primary",
    attention: "bg-accent",
    info: "bg-info",
    neutral: "bg-muted-foreground",
    danger: "bg-destructive",
  };
  return <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", map[tone])} />;
}

export function Panel({
  children,
  className,
  as: As = "section",
  ref,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  ref?: Ref<HTMLElement>;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <As
      ref={ref as Ref<HTMLDivElement> & Ref<HTMLElement>}
      className={cn("panel p-4", className)}
      {...rest}
    >
      {children}
    </As>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
  description,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <div
      className={cn(
        "scroll-reveal grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-primary" />
            <span className="text-primary/90">{eyebrow}</span>
          </p>
        ) : null}
        <h2 className="mt-1.5 font-display text-[17px] font-semibold text-balance">{title}</h2>

        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * One page header for every screen: where you are, what this page is for in
 * one plain sentence, and the single main action. Keeps every route stating
 * one clear purpose instead of a wall of controls.
 */
export function PageHead({
  eyebrow,
  title,
  purpose,
  action,
  className,
}: {
  /** Where this sits in the product, e.g. "Pipeline". */
  eyebrow: string;
  title: string;
  /** One sentence: what this page is for. Plain words, no jargon. */
  purpose?: string;
  /** The single primary action for this page. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-wrap items-end justify-between gap-3", className)}
      data-testid="page-head"
    >
      <div className="min-w-0">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-primary" />
          <span className="text-primary/90">{eyebrow}</span>
        </p>
        <h1 className="mt-1.5 font-display text-[24px] leading-tight font-semibold text-balance">
          {title}
        </h1>
        {purpose ? (
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
            {purpose}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  progress,
  className,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  progress?: number;
  className?: string;
  /** Small gold badge in the corner for key metrics. */
  badge?: string;
}) {
  const hintTone: Record<Tone, string> = {
    signal: "text-primary",
    attention: "text-accent",
    info: "text-info",
    neutral: "text-muted-foreground",
    danger: "text-destructive",
  };
  const barTone: Record<Tone, string> = {
    signal: "bg-primary",
    attention: "bg-accent",
    info: "bg-info",
    neutral: "bg-muted-foreground",
    danger: "bg-destructive",
  };
  return (
    <div
      className={cn(
        "panel card-lift relative p-3.5 transition-colors",
        tone === "signal" ? "border-primary/25" : null,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow flex min-w-0 items-center gap-1.5">
          {tone !== "neutral" ? <Dot tone={tone} /> : null}
          <span className="truncate">{label}</span>
        </p>
        {badge ? <KeyLabel className="shrink-0">{badge}</KeyLabel> : null}
      </div>
      <p
        className={cn(
          "tnum mt-2 font-display text-[26px] leading-none font-semibold",
          tone === "signal" ? "text-primary" : null,
        )}
      >
        {value}
      </p>
      {hint ? <p className={cn("mt-1.5 text-[11px]", hintTone[tone])}>{hint}</p> : null}
      {typeof progress === "number" ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-elevated">
          <div
            className={cn("h-full rounded-full", barTone[tone])}
            style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center px-6 py-12 text-center">
      {icon ? (
        <div className="mb-4 grid size-11 place-items-center rounded-lg bg-elevated text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="panel h-16 animate-pulse opacity-60" />
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive"
    >
      {message}
    </div>
  );
}
