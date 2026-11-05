import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { DemoPoint } from "@/lib/demo-workspace";

/**
 * Dependency-free SVG charts for the public product demo.
 * All series passed in are fictional demonstration data.
 */

function path(values: number[], w: number, h: number, pad = 2) {
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  className,
  tone = "primary",
}: {
  values: number[];
  className?: string;
  tone?: "primary" | "info" | "accent";
}) {
  const stroke =
    tone === "info"
      ? "var(--color-info)"
      : tone === "accent"
        ? "var(--color-accent)"
        : "var(--color-primary)";
  const d = useMemo(() => path(values, 100, 28), [values]);
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label="Demo trend"
      className={cn("h-7 w-full", className)}
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Interactive area + bar chart: leads (area) with booked jobs (bars). */
export function TrendChart({ points }: { points: DemoPoint[] }) {
  const gid = useId().replace(/[:]/g, "");
  const [active, setActive] = useState<number | null>(null);
  const w = 720;
  const h = 220;
  const pad = 8;

  const leads = points.map((p) => p.leads);
  const maxLeads = Math.max(...leads, 1);
  const line = path(leads, w, h - 26, pad);
  const area = `${line} L${w - pad},${h - 26 - pad} L${pad},${h - 26 - pad} Z`;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const shown = active === null ? points.length - 1 : active;
  const current = points[shown];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          Leads and booked jobs per day{" "}
          <span className="text-muted-foreground/70">(demo data)</span>
        </p>
        {current ? (
          <p className="tnum text-[12px]">
            <span className="text-muted-foreground">{current.label} · </span>
            <span className="gold-hl">{current.leads} leads</span>
            <span className="text-muted-foreground"> · {current.booked} booked</span>
          </p>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Demo chart of leads and booked jobs per day"
        className="mt-3 h-[200px] w-full sm:h-[230px]"
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={w - pad}
            y1={(h - 26) * f}
            y2={(h - 26) * f}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill={`url(#area-${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {points.map((p, i) => {
          const x = pad + i * stepX;
          const bh = (p.booked / maxLeads) * (h - 26 - pad * 2);
          return (
            <g key={`${p.label}-${i}`}>
              <rect
                x={x - Math.max(1.5, stepX * 0.22)}
                y={h - 26 - pad - bh}
                width={Math.max(3, stepX * 0.44)}
                height={Math.max(1, bh)}
                rx="1.5"
                fill="var(--color-info)"
                opacity={active === null || active === i ? 0.75 : 0.32}
              />
              <rect
                x={x - stepX / 2}
                y={0}
                width={Math.max(4, stepX)}
                height={h - 20}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                tabIndex={-1}
              />
              {active === i ? (
                <circle
                  cx={x}
                  cy={h - 26 - pad - (p.leads / maxLeads) * (h - 26 - pad * 2)}
                  r="3.5"
                  fill="var(--color-gold)"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" /> Leads
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-info" /> Booked jobs
        </span>
        <span className="ml-auto">
          {points[0]?.label} – {points[points.length - 1]?.label}
        </span>
      </div>
    </div>
  );
}

/** Horizontal funnel with step conversion rates. */
export function FunnelChart({
  rows,
  activeId,
  onSelect,
}: {
  rows: { id: string; label: string; count: number; share: number; stepRate: number }[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <ol className="mt-4 space-y-1.5">
      {rows.map((row, i) => {
        const active = activeId === row.id;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect?.(row.id)}
              aria-pressed={active}
              className={cn(
                "group w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary/45 bg-primary/10"
                  : "border-border bg-elevated hover:border-primary/30",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                  <span className="tnum text-xs text-muted-foreground">{i + 1}</span>
                  {row.label}
                </span>
                <span className="tnum text-[12px]">
                  <span className={active ? "gold-hl" : "font-semibold"}>
                    {row.count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground"> · {row.stepRate}% of previous</span>
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    i >= 4 ? "bg-primary" : i >= 2 ? "bg-accent" : "bg-info",
                  )}
                  style={{ width: `${Math.max(8, Math.round(Math.sqrt(row.share / 100) * 100))}%` }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
