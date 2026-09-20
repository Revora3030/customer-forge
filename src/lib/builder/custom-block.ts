/**
 * CUSTOM INTERACTIVE BLOCKS
 * =========================
 *
 * The builder is no longer limited to the fixed section vocabulary. When an
 * owner asks for something that does not exist yet — a price estimator, a
 * "which service is right for me" quiz, a comparison table, a process
 * timeline, tabs, a checklist, a figures strip — the planner emits a
 * CUSTOM BLOCK SPEC instead of prose.
 *
 * A spec is data, never code. It is validated here, stored in the section's
 * settings JSON, and rendered by trusted React components. That keeps the
 * whole Lovable-like "build me something new" capability inside the existing
 * safe apply / verify / rollback pipeline:
 *
 * - no generated JavaScript ever reaches a visitor's browser;
 * - every string is length-capped and stripped of markup and script schemes;
 * - every number is finite and bounded;
 * - anything that fails validation is rejected with an exact reason, so the
 *   builder can report a real blocked action instead of shipping a broken one.
 *
 * Truthfulness rule: a spec only ever repeats figures and wording the owner
 * supplied. Estimators must carry a note saying the result is an estimate.
 */

export type CustomBlockKind =
  | "calculator"
  | "quiz"
  | "comparison"
  | "checklist"
  | "steps"
  | "tabs"
  | "metrics";

export type CalculatorField = {
  id: string;
  label: string;
  kind: "number" | "select";
  /** Per-unit amount added for a number field. */
  rate?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  options?: { label: string; value: number }[];
};

export type CustomBlockSpec =
  | {
      type: "calculator";
      title?: string;
      note: string;
      resultLabel: string;
      currency: boolean;
      base: number;
      fields: CalculatorField[];
    }
  | {
      type: "quiz";
      title?: string;
      questions: { id: string; prompt: string; options: { label: string; outcome: string }[] }[];
      outcomes: { id: string; label: string; body?: string }[];
    }
  | { type: "comparison"; title?: string; columns: string[]; rows: { label: string; cells: string[] }[] }
  | { type: "checklist"; title?: string; items: { label: string; body?: string }[] }
  | { type: "steps"; title?: string; items: { label: string; body?: string }[] }
  | { type: "tabs"; title?: string; items: { label: string; body: string }[] }
  | { type: "metrics"; title?: string; items: { label: string; value: string }[] };

export type ParseResult =
  | { ok: true; spec: CustomBlockSpec }
  | { ok: false; reason: string };

const MAX_TITLE = 90;
const MAX_LABEL = 90;
const MAX_BODY = 420;
const MAX_NUMBER = 10_000_000;

/** Rejects markup and script-ish text outright rather than escaping it. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > max) return null;
  if (/[<>]/.test(trimmed)) return null;
  if (/(javascript|data|vbscript)\s*:/i.test(trimmed)) return null;
  if (/\{\{|\}\}/.test(trimmed)) return null; // unfinished template text
  return trimmed;
}

function num(value: unknown, fallback: number | null = null): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (Math.abs(parsed) > MAX_NUMBER) return fallback;
  return parsed;
}

function slug(value: unknown, index: number): string {
  const raw = typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") : "";
  const trimmed = raw.replace(/^_+|_+$/g, "").slice(0, 32);
  return trimmed || `item_${index + 1}`;
}

function list(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === "object" && !Array.isArray(row),
  );
  return rows.length === value.length ? rows : null;
}

function labelledItems(
  value: unknown,
  { min, max, bodyRequired }: { min: number; max: number; bodyRequired: boolean },
): { items: { label: string; body?: string }[] } | { reason: string } {
  const rows = list(value);
  if (!rows) return { reason: "items must be a list of objects" };
  if (rows.length < min || rows.length > max) {
    return { reason: `items must hold between ${min} and ${max} entries` };
  }
  const items: { label: string; body?: string }[] = [];
  for (const row of rows) {
    const label = clean(row["label"], MAX_LABEL);
    if (!label) return { reason: "every item needs a short, plain-text label" };
    const body = clean(row["body"], MAX_BODY);
    if (bodyRequired && !body) return { reason: "every item needs body text" };
    items.push(body ? { label, body } : { label });
  }
  return { items };
}

/**
 * Validates one custom block spec. Returns the exact reason on rejection so
 * the builder can report a genuinely blocked action instead of guessing.
 */
export function parseCustomBlock(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "the block spec must be an object" };
  }
  const row = raw as Record<string, unknown>;
  const type = typeof row["type"] === "string" ? row["type"].trim().toLowerCase() : "";
  const title = clean(row["title"], MAX_TITLE);

  switch (type) {
    case "calculator": {
      const note = clean(row["note"], MAX_BODY);
      if (!note) {
        return { ok: false, reason: "an estimator must carry a note saying the result is an estimate" };
      }
      const fields = list(row["fields"]);
      if (!fields || fields.length < 1 || fields.length > 8) {
        return { ok: false, reason: "an estimator needs between 1 and 8 questions" };
      }
      const parsed: CalculatorField[] = [];
      for (const [index, field] of fields.entries()) {
        const label = clean(field["label"], MAX_LABEL);
        if (!label) return { ok: false, reason: "every estimator question needs a label" };
        const kind = field["kind"] === "select" ? "select" : "number";
        const id = slug(field["id"] ?? label, index);
        if (kind === "select") {
          const options = list(field["options"]);
          if (!options || options.length < 2 || options.length > 8) {
            return { ok: false, reason: "a choice question needs between 2 and 8 options" };
          }
          const parsedOptions: { label: string; value: number }[] = [];
          for (const option of options) {
            const optionLabel = clean(option["label"], MAX_LABEL);
            const value = num(option["value"], null);
            if (!optionLabel || value === null) {
              return { ok: false, reason: "every option needs a label and a numeric amount" };
            }
            parsedOptions.push({ label: optionLabel, value });
          }
          parsed.push({ id, label, kind, options: parsedOptions });
          continue;
        }
        const rate = num(field["rate"], null);
        if (rate === null) {
          return { ok: false, reason: "a number question needs a per-unit amount" };
        }
        const min = num(field["min"], 0) ?? 0;
        const max = num(field["max"], Math.max(min + 1, 100)) ?? min + 1;
        if (max <= min) return { ok: false, reason: "a number question needs max above min" };
        const step = Math.max(num(field["step"], 1) ?? 1, 0.01);
        const start = num(field["value"], min) ?? min;
        parsed.push({
          id,
          label,
          kind,
          rate,
          min,
          max,
          step,
          value: Math.min(Math.max(start, min), max),
          ...(clean(field["unit"], 24) ? { unit: clean(field["unit"], 24) as string } : {}),
        });
      }
      const base = num(row["base"], 0) ?? 0;
      const resultLabel = clean(row["resultLabel"], MAX_LABEL) ?? "Estimated total";
      return {
        ok: true,
        spec: {
          type: "calculator",
          ...(title ? { title } : {}),
          note,
          resultLabel,
          currency: row["currency"] !== false,
          base,
          fields: parsed,
        },
      };
    }

    case "quiz": {
      const questions = list(row["questions"]);
      if (!questions || questions.length < 1 || questions.length > 10) {
        return { ok: false, reason: "a quiz needs between 1 and 10 questions" };
      }
      const outcomes = list(row["outcomes"]);
      if (!outcomes || outcomes.length < 2 || outcomes.length > 8) {
        return { ok: false, reason: "a quiz needs between 2 and 8 results" };
      }
      const parsedOutcomes: { id: string; label: string; body?: string }[] = [];
      for (const [index, outcome] of outcomes.entries()) {
        const label = clean(outcome["label"], MAX_LABEL);
        if (!label) return { ok: false, reason: "every quiz result needs a label" };
        const body = clean(outcome["body"], MAX_BODY);
        parsedOutcomes.push({
          id: slug(outcome["id"] ?? label, index),
          label,
          ...(body ? { body } : {}),
        });
      }
      const ids = new Set(parsedOutcomes.map((outcome) => outcome.id));
      const parsedQuestions: CustomBlockSpec extends { type: "quiz" } ? never : {
        id: string;
        prompt: string;
        options: { label: string; outcome: string }[];
      }[] = [];
      for (const [index, question] of questions.entries()) {
        const prompt = clean(question["prompt"], MAX_BODY);
        if (!prompt) return { ok: false, reason: "every quiz question needs a prompt" };
        const options = list(question["options"]);
        if (!options || options.length < 2 || options.length > 6) {
          return { ok: false, reason: "every quiz question needs between 2 and 6 answers" };
        }
        const parsedOptions: { label: string; outcome: string }[] = [];
        for (const option of options) {
          const label = clean(option["label"], MAX_LABEL);
          const outcome = typeof option["outcome"] === "string" ? slug(option["outcome"], 0) : "";
          if (!label || !ids.has(outcome)) {
            return { ok: false, reason: "every answer must point at one of the listed results" };
          }
          parsedOptions.push({ label, outcome });
        }
        parsedQuestions.push({ id: slug(question["id"] ?? prompt, index), prompt, options: parsedOptions });
      }
      return {
        ok: true,
        spec: {
          type: "quiz",
          ...(title ? { title } : {}),
          questions: parsedQuestions,
          outcomes: parsedOutcomes,
        },
      };
    }

    case "comparison": {
      const columnsRaw = Array.isArray(row["columns"]) ? row["columns"] : null;
      const columns = (columnsRaw ?? [])
        .map((column) => clean(column, MAX_LABEL))
        .filter((column): column is string => !!column);
      if (!columnsRaw || columns.length !== columnsRaw.length || columns.length < 2 || columns.length > 5) {
        return { ok: false, reason: "a comparison needs between 2 and 5 plain-text columns" };
      }
      const rows = list(row["rows"]);
      if (!rows || rows.length < 1 || rows.length > 14) {
        return { ok: false, reason: "a comparison needs between 1 and 14 rows" };
      }
      const parsedRows: { label: string; cells: string[] }[] = [];
      for (const entry of rows) {
        const label = clean(entry["label"], MAX_LABEL);
        const cellsRaw = Array.isArray(entry["cells"]) ? entry["cells"] : null;
        if (!label || !cellsRaw || cellsRaw.length !== columns.length) {
          return { ok: false, reason: "every comparison row needs a label and one cell per column" };
        }
        const cells = cellsRaw.map((cell) => clean(cell, MAX_LABEL) ?? "—");
        parsedRows.push({ label, cells });
      }
      return { ok: true, spec: { type: "comparison", ...(title ? { title } : {}), columns, rows: parsedRows } };
    }

    case "checklist":
    case "steps": {
      const result = labelledItems(row["items"], { min: 2, max: 12, bodyRequired: false });
      if ("reason" in result) return { ok: false, reason: result.reason };
      return { ok: true, spec: { type, ...(title ? { title } : {}), items: result.items } };
    }

    case "tabs": {
      const result = labelledItems(row["items"], { min: 2, max: 8, bodyRequired: true });
      if ("reason" in result) return { ok: false, reason: result.reason };
      return {
        ok: true,
        spec: {
          type: "tabs",
          ...(title ? { title } : {}),
          items: result.items.map((item) => ({ label: item.label, body: item.body ?? "" })),
        },
      };
    }

    case "metrics": {
      const rows = list(row["items"]);
      if (!rows || rows.length < 2 || rows.length > 8) {
        return { ok: false, reason: "a figures strip needs between 2 and 8 entries" };
      }
      const items: { label: string; value: string }[] = [];
      for (const entry of rows) {
        const label = clean(entry["label"], MAX_LABEL);
        const value = clean(entry["value"], 32);
        if (!label || !value) {
          return { ok: false, reason: "every figure needs a label and a value the owner supplied" };
        }
        items.push({ label, value });
      }
      return { ok: true, spec: { type: "metrics", ...(title ? { title } : {}), items } };
    }

    default:
      return {
        ok: false,
        reason:
          "unknown block type — use calculator, quiz, comparison, checklist, steps, tabs or metrics",
      };
  }
}

/** Reads a validated spec back off a stored section. */
export function readCustomBlock(settings: unknown): CustomBlockSpec | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const raw = (settings as Record<string, unknown>)["custom"];
  const parsed = parseCustomBlock(raw);
  return parsed.ok ? parsed.spec : null;
}

/** Merges a validated spec into a section's settings JSON, leaving the rest alone. */
export function writeCustomBlock(settings: unknown, spec: CustomBlockSpec): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  base["custom"] = spec as unknown as Record<string, unknown>;
  return base;
}

/** Plain-language summary for the plan timeline and the proof report. */
export function describeCustomBlock(spec: CustomBlockSpec): string {
  switch (spec.type) {
    case "calculator":
      return `${spec.title ?? "Estimate tool"} — ${spec.fields.length} question${spec.fields.length === 1 ? "" : "s"}, live total`;
    case "quiz":
      return `${spec.title ?? "Guided picker"} — ${spec.questions.length} questions, ${spec.outcomes.length} results`;
    case "comparison":
      return `${spec.title ?? "Comparison table"} — ${spec.rows.length} rows across ${spec.columns.length} columns`;
    case "checklist":
      return `${spec.title ?? "Checklist"} — ${spec.items.length} items`;
    case "steps":
      return `${spec.title ?? "Step-by-step"} — ${spec.items.length} steps`;
    case "tabs":
      return `${spec.title ?? "Tabbed panel"} — ${spec.items.length} tabs`;
    case "metrics":
      return `${spec.title ?? "Figures"} — ${spec.items.length} values`;
  }
}
