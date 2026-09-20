/**
 * FREE-FORM BLOCKS
 * ================
 *
 * The thirteen fixed interactive block kinds cover common asks. This module
 * covers the rest: when an owner asks for something that has no ready-made
 * shape — "a side-by-side panel where picking a room size updates the crew
 * size and the visit length, with a badge that only shows for jobs over four
 * hours" — the planner emits a FREE-FORM TREE instead of picking a kind.
 *
 * The tree is still data, never code:
 *
 * - a closed vocabulary of layout and content nodes (stack, grid, card,
 *   heading, text, list, badge, image, link, divider, field, value, when);
 * - a closed vocabulary of arithmetic and comparison steps for anything that
 *   reacts to a visitor's choices, evaluated by a trusted interpreter that
 *   never touches `eval`, `new Function`, template strings or the DOM;
 * - every string cleaned and length-capped, every number finite and bounded,
 *   every link put through the same safe-link gate as the rest of the site;
 * - hard caps on node count, nesting depth, field count and expression depth,
 *   so a runaway plan is rejected rather than shipped;
 * - anything that fails is rejected with an exact reason, so the builder
 *   reports a genuinely blocked action instead of half-applying a change.
 *
 * Truthfulness rule: any tree that computes and shows a number must carry a
 * note saying the figure is a guide, exactly like the estimator block.
 */
import { safeLinkUrl } from "@/lib/website-content";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type FreeformExpr =
  | { op: "num"; value: number }
  | { op: "ref"; id: string }
  | { op: "add" | "sub" | "mul" | "div" | "min" | "max"; args: FreeformExpr[] }
  | { op: "round"; args: FreeformExpr[] }
  | { op: "gt" | "gte" | "lt" | "lte" | "eq"; args: FreeformExpr[] }
  | { op: "and" | "or"; args: FreeformExpr[] }
  | { op: "not"; args: FreeformExpr[] };

export type FreeformField =
  | {
      node: "field";
      kind: "number";
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
      unit?: string;
    }
  | {
      node: "field";
      kind: "select";
      id: string;
      label: string;
      options: { label: string; value: number }[];
    }
  | { node: "field"; kind: "toggle"; id: string; label: string; value: number };

export type FreeformNode =
  | { node: "stack"; direction: "row" | "column"; gap: number; align?: "start" | "center" | "end"; children: FreeformNode[] }
  | { node: "grid"; columns: number; gap: number; children: FreeformNode[] }
  | { node: "card"; tone: "surface" | "muted" | "accent" | "outline"; children: FreeformNode[] }
  | { node: "heading"; level: 2 | 3 | 4; text: string }
  | { node: "text"; text: string; tone: "default" | "muted"; size: "sm" | "md" | "lg" }
  | { node: "badge"; text: string; tone: "signal" | "attention" | "neutral" }
  | { node: "list"; ordered: boolean; items: string[] }
  | { node: "image"; src: string; alt: string; ratio: "16:9" | "4:3" | "1:1" | "3:2" }
  | { node: "link"; text: string; href: string; variant: "primary" | "secondary" | "quiet" }
  | { node: "divider" }
  | FreeformField
  | {
      node: "value";
      label: string;
      expr: FreeformExpr;
      format: "number" | "currency" | "percent" | "duration";
      caption?: string;
    }
  | { node: "when"; expr: FreeformExpr; children: FreeformNode[] };

export type FreeformSpec = {
  type: "freeform";
  title?: string;
  note?: string;
  root: FreeformNode[];
};

export type FreeformParseResult =
  | { ok: true; spec: FreeformSpec }
  | { ok: false; reason: string };

/* -------------------------------------------------------------------------- */
/* Caps                                                                       */
/* -------------------------------------------------------------------------- */

const MAX_NODES = 160;
const MAX_DEPTH = 7;
const MAX_FIELDS = 12;
const MAX_EXPR_DEPTH = 8;
const MAX_EXPR_NODES = 60;
const MAX_TEXT = 90;
const MAX_BODY = 420;
const MAX_NUMBER = 10_000_000;
const MAX_LIST_ITEMS = 14;
const MAX_CHILDREN = 16;

const VARIADIC = new Set(["add", "mul", "min", "max", "and", "or"]);
const BINARY = new Set(["sub", "div", "gt", "gte", "lt", "lte", "eq"]);
const BOOLEAN_OPS = new Set(["gt", "gte", "lt", "lte", "eq", "and", "or", "not"]);

/* -------------------------------------------------------------------------- */
/* Primitive cleaners (same posture as the fixed block kinds)                 */
/* -------------------------------------------------------------------------- */

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > max) return null;
  if (/[<>]/.test(trimmed)) return null;
  if (/(javascript|data|vbscript)\s*:/i.test(trimmed)) return null;
  if (/\{\{|\}\}/.test(trimmed)) return null;
  return trimmed;
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > MAX_NUMBER) return null;
  return parsed;
}

function ident(value: unknown, index: number): string {
  const raw = typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") : "";
  const trimmed = raw.replace(/^_+|_+$/g, "").slice(0, 32);
  return trimmed || `input_${index + 1}`;
}

function objects(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(
    (row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row),
  );
  return rows.length === value.length ? rows : null;
}

/* -------------------------------------------------------------------------- */
/* Expression validation                                                      */
/* -------------------------------------------------------------------------- */

type ExprContext = { fields: Set<string>; nodes: { count: number } };

function parseExpr(raw: unknown, ctx: ExprContext, depth: number): FreeformExpr | { reason: string } {
  if (depth > MAX_EXPR_DEPTH) return { reason: "a calculation is nested too deeply" };
  ctx.nodes.count += 1;
  if (ctx.nodes.count > MAX_EXPR_NODES) return { reason: "a calculation has too many steps" };
  if (typeof raw === "number") {
    const value = num(raw);
    return value === null ? { reason: "a calculation holds a number that is out of range" } : { op: "num", value };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { reason: "every calculation step must be an object or a plain number" };
  }
  const row = raw as Record<string, unknown>;
  const op = typeof row["op"] === "string" ? row["op"].trim().toLowerCase() : "";

  if (op === "num") {
    const value = num(row["value"]);
    return value === null ? { reason: "a calculation holds a number that is out of range" } : { op: "num", value };
  }
  if (op === "ref") {
    const id = typeof row["id"] === "string" ? ident(row["id"], 0) : "";
    if (!id || !ctx.fields.has(id)) {
      return { reason: "a calculation refers to an input that does not exist in this block" };
    }
    return { op: "ref", id };
  }

  const variadic = VARIADIC.has(op);
  const binary = BINARY.has(op);
  const unary = op === "not" || op === "round";
  if (!variadic && !binary && !unary) {
    return {
      reason:
        "unknown calculation step — use num, ref, add, sub, mul, div, min, max, round, gt, gte, lt, lte, eq, and, or, not",
    };
  }

  const rawArgs = Array.isArray(row["args"]) ? row["args"] : null;
  if (!rawArgs) return { reason: `the "${op}" step needs an args list` };
  if (unary && rawArgs.length !== 1) return { reason: `the "${op}" step takes exactly one value` };
  if (binary && rawArgs.length !== 2) return { reason: `the "${op}" step takes exactly two values` };
  if (variadic && (rawArgs.length < 2 || rawArgs.length > 8)) {
    return { reason: `the "${op}" step takes between two and eight values` };
  }

  const args: FreeformExpr[] = [];
  for (const arg of rawArgs) {
    const parsed = parseExpr(arg, ctx, depth + 1);
    if ("reason" in parsed) return parsed;
    args.push(parsed);
  }
  return { op, args } as FreeformExpr;
}

/** True when the expression produces a yes/no answer rather than a figure. */
export function isConditionExpr(expr: FreeformExpr): boolean {
  return BOOLEAN_OPS.has(expr.op);
}

/* -------------------------------------------------------------------------- */
/* Expression evaluation (trusted interpreter, no code execution)             */
/* -------------------------------------------------------------------------- */

export function evaluateExpr(expr: FreeformExpr, values: Record<string, number>): number {
  switch (expr.op) {
    case "num":
      return expr.value;
    case "ref":
      return Number.isFinite(values[expr.id]) ? (values[expr.id] as number) : 0;
    default:
      break;
  }
  const args = expr.args.map((arg) => evaluateExpr(arg, values));
  switch (expr.op) {
    case "add":
      return args.reduce((sum, value) => sum + value, 0);
    case "mul":
      return args.reduce((product, value) => product * value, 1);
    case "sub":
      return (args[0] ?? 0) - (args[1] ?? 0);
    case "div": {
      const divisor = args[1] ?? 0;
      return divisor === 0 ? 0 : (args[0] ?? 0) / divisor;
    }
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "round":
      return Math.round(args[0] ?? 0);
    case "gt":
      return (args[0] ?? 0) > (args[1] ?? 0) ? 1 : 0;
    case "gte":
      return (args[0] ?? 0) >= (args[1] ?? 0) ? 1 : 0;
    case "lt":
      return (args[0] ?? 0) < (args[1] ?? 0) ? 1 : 0;
    case "lte":
      return (args[0] ?? 0) <= (args[1] ?? 0) ? 1 : 0;
    case "eq":
      return (args[0] ?? 0) === (args[1] ?? 0) ? 1 : 0;
    case "and":
      return args.every((value) => value !== 0) ? 1 : 0;
    case "or":
      return args.some((value) => value !== 0) ? 1 : 0;
    case "not":
      return (args[0] ?? 0) === 0 ? 1 : 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Node validation                                                            */
/* -------------------------------------------------------------------------- */

type NodeContext = {
  fields: Set<string>;
  nodeCount: { count: number };
  fieldCount: { count: number };
  computes: { any: boolean };
};

function parseChildren(
  raw: unknown,
  ctx: NodeContext,
  depth: number,
): FreeformNode[] | { reason: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { reason: "every container needs at least one child" };
  if (raw.length > MAX_CHILDREN) return { reason: `a container may hold at most ${MAX_CHILDREN} children` };
  const out: FreeformNode[] = [];
  for (const child of raw) {
    const parsed = parseNode(child, ctx, depth + 1);
    if ("reason" in parsed) return parsed;
    out.push(parsed.node);
  }
  return out;
}

function parseNode(
  raw: unknown,
  ctx: NodeContext,
  depth: number,
): { node: FreeformNode } | { reason: string } {
  if (depth > MAX_DEPTH) return { reason: "the layout is nested too deeply" };
  ctx.nodeCount.count += 1;
  if (ctx.nodeCount.count > MAX_NODES) return { reason: `a block may hold at most ${MAX_NODES} parts` };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { reason: "every part of the layout must be an object" };
  }
  const row = raw as Record<string, unknown>;
  const node = typeof row["node"] === "string" ? row["node"].trim().toLowerCase() : "";

  switch (node) {
    case "stack": {
      const children = parseChildren(row["children"], ctx, depth);
      if ("reason" in children) return children;
      const align = row["align"];
      return {
        node: {
          node: "stack",
          direction: row["direction"] === "row" ? "row" : "column",
          gap: Math.min(Math.max(Math.round(num(row["gap"]) ?? 3), 0), 8),
          ...(align === "center" || align === "end" || align === "start" ? { align } : {}),
          children,
        },
      };
    }

    case "grid": {
      const children = parseChildren(row["children"], ctx, depth);
      if ("reason" in children) return children;
      return {
        node: {
          node: "grid",
          columns: Math.min(Math.max(Math.round(num(row["columns"]) ?? 2), 1), 4),
          gap: Math.min(Math.max(Math.round(num(row["gap"]) ?? 4), 0), 8),
          children,
        },
      };
    }

    case "card": {
      const children = parseChildren(row["children"], ctx, depth);
      if ("reason" in children) return children;
      const tone = row["tone"];
      return {
        node: {
          node: "card",
          tone: tone === "muted" || tone === "accent" || tone === "outline" ? tone : "surface",
          children,
        },
      };
    }

    case "heading": {
      const text = clean(row["text"], MAX_TEXT);
      if (!text) return { reason: "every heading needs short, plain text" };
      const level = Math.round(num(row["level"]) ?? 3);
      return { node: { node: "heading", level: level === 2 ? 2 : level === 4 ? 4 : 3, text } };
    }

    case "text": {
      const text = clean(row["text"], MAX_BODY);
      if (!text) return { reason: "every paragraph needs plain text" };
      const size = row["size"];
      return {
        node: {
          node: "text",
          text,
          tone: row["tone"] === "muted" ? "muted" : "default",
          size: size === "sm" || size === "lg" ? size : "md",
        },
      };
    }

    case "badge": {
      const text = clean(row["text"], 40);
      if (!text) return { reason: "every badge needs short, plain text" };
      const tone = row["tone"];
      return {
        node: {
          node: "badge",
          text,
          tone: tone === "attention" || tone === "neutral" ? tone : "signal",
        },
      };
    }

    case "list": {
      if (!Array.isArray(row["items"])) return { reason: "a list needs an items array" };
      const items = row["items"].map((item) => clean(item, MAX_BODY));
      if (items.some((item) => item === null)) return { reason: "every list entry needs plain text" };
      if (items.length < 1 || items.length > MAX_LIST_ITEMS) {
        return { reason: `a list needs between 1 and ${MAX_LIST_ITEMS} entries` };
      }
      return { node: { node: "list", ordered: row["ordered"] === true, items: items as string[] } };
    }

    case "image": {
      const src = safeLinkUrl(typeof row["src"] === "string" ? row["src"] : "");
      const alt = clean(row["alt"], MAX_TEXT);
      if (!src || !/^(https?:|\/)/i.test(src)) {
        return { reason: "a picture needs a web address on this site or a public https address" };
      }
      if (!alt) return { reason: "every picture needs a short description for screen readers" };
      const ratio = row["ratio"];
      return {
        node: {
          node: "image",
          src,
          alt,
          ratio: ratio === "4:3" || ratio === "1:1" || ratio === "3:2" ? ratio : "16:9",
        },
      };
    }

    case "link": {
      const text = clean(row["text"], MAX_TEXT);
      const href = safeLinkUrl(typeof row["href"] === "string" ? row["href"] : "");
      if (!text) return { reason: "every button needs a label" };
      if (!href) return { reason: "every button needs a safe address — a page, an on-page jump, email or phone" };
      const variant = row["variant"];
      return {
        node: {
          node: "link",
          text,
          href,
          variant: variant === "secondary" || variant === "quiet" ? variant : "primary",
        },
      };
    }

    case "divider":
      return { node: { node: "divider" } };

    case "field": {
      ctx.fieldCount.count += 1;
      if (ctx.fieldCount.count > MAX_FIELDS) {
        return { reason: `a block may hold at most ${MAX_FIELDS} visitor inputs` };
      }
      const label = clean(row["label"], MAX_TEXT);
      if (!label) return { reason: "every input needs a label" };
      const id = ident(row["id"] ?? label, ctx.fieldCount.count - 1);
      if (ctx.fields.has(id)) return { reason: `two inputs share the name "${id}"` };
      const kind = row["kind"] === "select" ? "select" : row["kind"] === "toggle" ? "toggle" : "number";

      if (kind === "select") {
        const options = objects(row["options"]);
        if (!options || options.length < 2 || options.length > 8) {
          return { reason: "a choice input needs between 2 and 8 options" };
        }
        const parsed: { label: string; value: number }[] = [];
        for (const option of options) {
          const optionLabel = clean(option["label"], MAX_TEXT);
          const value = num(option["value"]);
          if (!optionLabel || value === null) {
            return { reason: "every option needs a label and a number" };
          }
          parsed.push({ label: optionLabel, value });
        }
        ctx.fields.add(id);
        return { node: { node: "field", kind: "select", id, label, options: parsed } };
      }

      if (kind === "toggle") {
        ctx.fields.add(id);
        return { node: { node: "field", kind: "toggle", id, label, value: num(row["value"]) ? 1 : 0 } };
      }

      const min = num(row["min"]) ?? 0;
      const max = num(row["max"]) ?? Math.max(min + 1, 100);
      if (max <= min) return { reason: "a number input needs a maximum above its minimum" };
      const step = Math.max(num(row["step"]) ?? 1, 0.01);
      const start = Math.min(Math.max(num(row["value"]) ?? min, min), max);
      const unit = clean(row["unit"], 24);
      ctx.fields.add(id);
      return {
        node: {
          node: "field",
          kind: "number",
          id,
          label,
          min,
          max,
          step,
          value: start,
          ...(unit ? { unit } : {}),
        },
      };
    }

    case "value": {
      const label = clean(row["label"], MAX_TEXT);
      if (!label) return { reason: "every calculated readout needs a label" };
      const expr = parseExpr(row["expr"], { fields: ctx.fields, nodes: { count: 0 } }, 0);
      if ("reason" in expr) return expr;
      if (isConditionExpr(expr)) {
        return { reason: "a readout must calculate a figure, not a yes/no answer" };
      }
      const format = row["format"];
      const caption = clean(row["caption"], MAX_BODY);
      ctx.computes.any = true;
      return {
        node: {
          node: "value",
          label,
          expr,
          format:
            format === "currency" || format === "percent" || format === "duration" ? format : "number",
          ...(caption ? { caption } : {}),
        },
      };
    }

    case "when": {
      const expr = parseExpr(row["expr"], { fields: ctx.fields, nodes: { count: 0 } }, 0);
      if ("reason" in expr) return expr;
      if (!isConditionExpr(expr)) {
        return { reason: "a conditional part needs a yes/no test such as gt, lt, eq, and, or or not" };
      }
      const children = parseChildren(row["children"], ctx, depth);
      if ("reason" in children) return children;
      return { node: { node: "when", expr, children } };
    }

    default:
      return {
        reason:
          "unknown layout part — use stack, grid, card, heading, text, badge, list, image, link, divider, field, value or when",
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Validates one free-form block. Inputs are declared before anything can refer
 * to them, so a readout can never point at an input that arrives later.
 */
export function parseFreeformBlock(raw: unknown): FreeformParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "the block spec must be an object" };
  }
  const row = raw as Record<string, unknown>;
  const title = clean(row["title"], MAX_TEXT);
  const note = clean(row["note"], MAX_BODY);

  const ctx: NodeContext = {
    fields: new Set<string>(),
    nodeCount: { count: 0 },
    fieldCount: { count: 0 },
    computes: { any: false },
  };

  if (!Array.isArray(row["root"]) || row["root"].length === 0) {
    return { ok: false, reason: "a free-form block needs a root list of parts" };
  }
  if (row["root"].length > MAX_CHILDREN) {
    return { ok: false, reason: `the root may hold at most ${MAX_CHILDREN} parts` };
  }

  const root: FreeformNode[] = [];
  for (const child of row["root"]) {
    const parsed = parseNode(child, ctx, 1);
    if ("reason" in parsed) return { ok: false, reason: parsed.reason };
    root.push(parsed.node);
  }

  if (ctx.computes.any && !note) {
    return {
      ok: false,
      reason: "a block that works out a figure must carry a note saying the result is a guide",
    };
  }

  return {
    ok: true,
    spec: {
      type: "freeform",
      ...(title ? { title } : {}),
      ...(note ? { note } : {}),
      root,
    },
  };
}

/** Starting values for every input in the tree, in declaration order. */
export function freeformInitialValues(root: FreeformNode[]): Record<string, number> {
  const values: Record<string, number> = {};
  const walk = (nodes: FreeformNode[]) => {
    for (const node of nodes) {
      if (node.node === "field") {
        values[node.id] = node.kind === "select" ? (node.options[0]?.value ?? 0) : node.value;
        continue;
      }
      if (node.node === "stack" || node.node === "grid" || node.node === "card" || node.node === "when") {
        walk(node.children);
      }
    }
  };
  walk(root);
  return values;
}

function countNodes(nodes: FreeformNode[]): { total: number; fields: number; readouts: number } {
  let total = 0;
  let fields = 0;
  let readouts = 0;
  const walk = (list: FreeformNode[]) => {
    for (const node of list) {
      total += 1;
      if (node.node === "field") fields += 1;
      if (node.node === "value") readouts += 1;
      if (node.node === "stack" || node.node === "grid" || node.node === "card" || node.node === "when") {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return { total, fields, readouts };
}

/** Plain-language summary for the plan timeline and the proof report. */
export function describeFreeformBlock(spec: FreeformSpec): string {
  const { total, fields, readouts } = countNodes(spec.root);
  const bits = [`${total} part${total === 1 ? "" : "s"}`];
  if (fields > 0) bits.push(`${fields} visitor input${fields === 1 ? "" : "s"}`);
  if (readouts > 0) bits.push(`${readouts} live figure${readouts === 1 ? "" : "s"}`);
  return `${spec.title ?? "Custom panel"} — ${bits.join(", ")}`;
}
