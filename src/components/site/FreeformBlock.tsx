/**
 * Renders a validated free-form block on a public business website.
 *
 * The tree has already passed `parseFreeformBlock`, so every part here is one
 * of a closed set of shapes and every calculation is an already-checked step
 * list. Nothing generated is executed: this component walks data and returns
 * plain React. Styling uses design tokens only, so a block inherits the site's
 * own palette and typography instead of carrying its own colours.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  evaluateExpr,
  freeformInitialValues,
  type FreeformNode,
  type FreeformSpec,
} from "@/lib/builder/freeform";

const GAP = ["gap-0", "gap-1", "gap-2", "gap-3", "gap-4", "gap-5", "gap-6", "gap-8", "gap-10"];
const COLUMNS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"];
const RATIO: Record<string, string> = {
  "16:9": "aspect-[16/9]",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
  "3:2": "aspect-[3/2]",
};
const ALIGN: Record<string, string> = { start: "items-start", center: "items-center", end: "items-end" };
const CARD: Record<string, string> = {
  surface: "rounded-2xl border border-border bg-card/60 p-5",
  muted: "rounded-2xl bg-muted/40 p-5",
  accent: "rounded-2xl border border-primary/30 bg-primary/5 p-5",
  outline: "rounded-2xl border border-border p-5",
};
const BADGE: Record<string, string> = {
  signal: "border-primary/40 bg-primary/10 text-foreground",
  attention: "border-border bg-muted text-foreground",
  neutral: "border-border text-muted-foreground",
};
const TEXT_SIZE: Record<string, string> = {
  sm: "text-[13px]",
  md: "text-[15px]",
  lg: "text-[18px]",
};

function format(value: number, kind: "number" | "currency" | "percent" | "duration"): string {
  const rounded = Math.round(value * 100) / 100;
  if (kind === "currency") {
    return `$${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (kind === "percent") return `${Math.round(rounded)}%`;
  if (kind === "duration") {
    const total = Math.max(Math.round(rounded), 0);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
    if (hours > 0) return `${hours} hr`;
    return `${minutes} min`;
  }
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

type Ctx = {
  values: Record<string, number>;
  set: (id: string, value: number) => void;
};

function Nodes({ nodes, ctx }: { nodes: FreeformNode[]; ctx: Ctx }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Node key={index} node={node} ctx={ctx} />
      ))}
    </>
  );
}

function Node({ node, ctx }: { node: FreeformNode; ctx: Ctx }) {
  switch (node.node) {
    case "stack":
      return (
        <div
          className={`flex ${node.direction === "row" ? "flex-col sm:flex-row" : "flex-col"} ${
            GAP[node.gap] ?? "gap-3"
          } ${node.align ? (ALIGN[node.align] ?? "") : ""}`}
        >
          <Nodes nodes={node.children} ctx={ctx} />
        </div>
      );

    case "grid":
      return (
        <div className={`grid grid-cols-1 ${COLUMNS[node.columns] ?? "sm:grid-cols-2"} ${GAP[node.gap] ?? "gap-4"}`}>
          <Nodes nodes={node.children} ctx={ctx} />
        </div>
      );

    case "card":
      return (
        <div className={`grid gap-3 ${CARD[node.tone] ?? CARD["surface"]}`}>
          <Nodes nodes={node.children} ctx={ctx} />
        </div>
      );

    case "heading": {
      const Tag = node.level === 2 ? "h2" : node.level === 4 ? "h4" : "h3";
      const size = node.level === 2 ? "text-[28px]" : node.level === 3 ? "text-[20px]" : "text-[17px]";
      return <Tag className={`font-display ${size} leading-tight font-semibold`}>{node.text}</Tag>;
    }

    case "text":
      return (
        <p
          className={`${TEXT_SIZE[node.size] ?? "text-[15px]"} leading-relaxed ${
            node.tone === "muted" ? "text-muted-foreground" : ""
          }`}
        >
          {node.text}
        </p>
      );

    case "badge":
      return (
        <span
          className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[12px] font-medium ${
            BADGE[node.tone] ?? BADGE["signal"]
          }`}
        >
          {node.text}
        </span>
      );

    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return (
        <Tag className={`grid gap-2 ${node.ordered ? "list-decimal" : "list-disc"} pl-5 text-[15px] leading-relaxed`}>
          {node.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </Tag>
      );
    }

    case "image":
      return (
        <img
          src={node.src}
          alt={node.alt}
          loading="lazy"
          decoding="async"
          className={`w-full ${RATIO[node.ratio] ?? RATIO["16:9"]} rounded-2xl object-cover`}
        />
      );

    case "link":
      return (
        <Button
          asChild
          variant={node.variant === "primary" ? "signal" : node.variant === "secondary" ? "outline" : "ghost"}
          className="min-h-11 w-fit"
        >
          <a href={node.href}>{node.text}</a>
        </Button>
      );

    case "divider":
      return <hr className="border-border" />;

    case "field": {
      const current = ctx.values[node.id] ?? 0;
      if (node.kind === "select") {
        return (
          <label className="grid gap-2 text-[14px]">
            <span className="font-medium">{node.label}</span>
            <select
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
              value={current}
              onChange={(event) => ctx.set(node.id, Number(event.target.value))}
            >
              {node.options.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        );
      }
      if (node.kind === "toggle") {
        return (
          <button
            type="button"
            aria-pressed={current !== 0}
            onClick={() => ctx.set(node.id, current === 0 ? 1 : 0)}
            className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-4 text-[14px] transition ${
              current !== 0 ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            <span className="font-medium">{node.label}</span>
            <span>{current !== 0 ? "Yes" : "No"}</span>
          </button>
        );
      }
      return (
        <label className="grid gap-2 text-[14px]">
          <span className="font-medium">
            {node.label}
            {node.unit ? <span className="text-muted-foreground"> ({node.unit})</span> : null}
          </span>
          <input
            type="number"
            inputMode="decimal"
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
            min={node.min}
            max={node.max}
            step={node.step}
            value={current}
            onChange={(event) => {
              const next = Number(event.target.value);
              const safe = Number.isFinite(next) ? Math.min(Math.max(next, node.min), node.max) : node.min;
              ctx.set(node.id, safe);
            }}
          />
        </label>
      );
    }

    case "value": {
      const result = evaluateExpr(node.expr, ctx.values);
      return (
        <div aria-live="polite" className="rounded-2xl border border-border bg-card/60 p-5">
          <p className="text-[13px] text-muted-foreground">{node.label}</p>
          <p className="mt-1 font-display text-[28px] leading-tight font-semibold">{format(result, node.format)}</p>
          {node.caption ? <p className="mt-2 text-[13px] text-muted-foreground">{node.caption}</p> : null}
        </div>
      );
    }

    case "when": {
      const show = evaluateExpr(node.expr, ctx.values) !== 0;
      if (!show) return null;
      return (
        <div className="grid gap-3">
          <Nodes nodes={node.children} ctx={ctx} />
        </div>
      );
    }
  }
}

export function FreeformBlock({ spec }: { spec: FreeformSpec }) {
  const [values, setValues] = useState<Record<string, number>>(() => freeformInitialValues(spec.root));
  const ctx = useMemo<Ctx>(
    () => ({
      values,
      set: (id, value) => setValues((current) => ({ ...current, [id]: value })),
    }),
    [values],
  );

  return (
    <div className="grid gap-4">
      {spec.title ? (
        <h2 className="font-display text-[28px] leading-tight font-semibold">{spec.title}</h2>
      ) : null}
      <Nodes nodes={spec.root} ctx={ctx} />
      {spec.note ? <p className="text-[13px] text-muted-foreground">{spec.note}</p> : null}
    </div>
  );
}
