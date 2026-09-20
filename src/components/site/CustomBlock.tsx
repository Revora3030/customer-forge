/**
 * Renders a validated custom interactive block on a public business website.
 *
 * Everything here is driven by a data-only spec that has already passed
 * `parseCustomBlock`, so no generated code runs in a visitor's browser. Each
 * widget is plain React with keyboard-reachable controls, a single column on a
 * phone, and no invented figures — every number and word comes from the spec.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CustomBlockSpec } from "@/lib/builder/custom-block";

function Title({ title }: { title?: string | undefined }) {
  if (!title) return null;
  return <h2 className="font-display text-[28px] leading-tight font-semibold">{title}</h2>;
}

function money(value: number, currency: boolean): string {
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `$${text}` : text;
}

function Estimator({ spec }: { spec: Extract<CustomBlockSpec, { type: "calculator" }> }) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const start: Record<string, number> = {};
    for (const field of spec.fields) {
      start[field.id] = field.kind === "select" ? (field.options?.[0]?.value ?? 0) : (field.value ?? 0);
    }
    return start;
  });

  const total = useMemo(() => {
    let sum = spec.base;
    for (const field of spec.fields) {
      const value = values[field.id] ?? 0;
      sum += field.kind === "select" ? value : value * (field.rate ?? 0);
    }
    return Math.max(sum, 0);
  }, [spec, values]);

  return (
    <div>
      <Title title={spec.title} />
      <div className="mt-6 grid gap-4">
        {spec.fields.map((field) => (
          <label key={field.id} className="grid gap-2 text-[14px]">
            <span className="font-medium">
              {field.label}
              {field.unit ? <span className="text-muted-foreground"> ({field.unit})</span> : null}
            </span>
            {field.kind === "select" ? (
              <select
                className="min-h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
                value={values[field.id] ?? 0}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.id]: Number(event.target.value) }))
                }
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                inputMode="decimal"
                className="min-h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
                min={field.min}
                max={field.max}
                step={field.step}
                value={values[field.id] ?? 0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const min = field.min ?? 0;
                  const max = field.max ?? min;
                  const safe = Number.isFinite(next) ? Math.min(Math.max(next, min), max) : min;
                  setValues((current) => ({ ...current, [field.id]: safe }));
                }}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
        <p className="eyebrow">{spec.resultLabel}</p>
        <p aria-live="polite" className="mt-1 font-display text-[30px] font-semibold">
          {money(total, spec.currency)}
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">{spec.note}</p>
      </div>
    </div>
  );
}

function GuidedPicker({ spec }: { spec: Extract<CustomBlockSpec, { type: "quiz" }> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answered = spec.questions.filter((question) => answers[question.id]).length;
  const result = useMemo(() => {
    if (answered < spec.questions.length) return null;
    const tally = new Map<string, number>();
    for (const outcome of Object.values(answers)) {
      tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const outcome of spec.outcomes) {
      const count = tally.get(outcome.id) ?? 0;
      if (count > bestCount) {
        best = outcome.id;
        bestCount = count;
      }
    }
    return spec.outcomes.find((outcome) => outcome.id === best) ?? null;
  }, [answers, answered, spec]);

  return (
    <div>
      <Title title={spec.title} />
      <div className="mt-6 grid gap-6">
        {spec.questions.map((question) => (
          <fieldset key={question.id} className="grid gap-2">
            <legend className="text-[15px] font-medium">{question.prompt}</legend>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => {
                const active = answers[question.id] === option.outcome;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setAnswers((current) => ({ ...current, [question.id]: option.outcome }))
                    }
                    className={`min-h-11 rounded-full border px-4 text-[14px] transition ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div aria-live="polite" className="mt-6">
        {result ? (
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <p className="eyebrow">Best fit</p>
            <p className="mt-1 font-display text-[22px] font-semibold">{result.label}</p>
            {result.body ? (
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{result.body}</p>
            ) : null}
            <Button asChild variant="signal" className="mt-4 min-h-11">
              <a href="#contact">Talk to us about this</a>
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {answered} of {spec.questions.length} answered.
          </p>
        )}
      </div>
    </div>
  );
}

function ComparisonTable({ spec }: { spec: Extract<CustomBlockSpec, { type: "comparison" }> }) {
  return (
    <div>
      <Title title={spec.title} />
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-[14px]">
          <thead>
            <tr>
              <th scope="col" className="border-b border-border px-3 py-2 text-left" />
              {spec.columns.map((column) => (
                <th key={column} scope="col" className="border-b border-border px-3 py-2 text-left font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-b border-border px-3 py-2 text-left font-medium">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={`${row.label}-${spec.columns[index] ?? index}`}
                    className="border-b border-border px-3 py-2 text-muted-foreground"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemList({
  spec,
}: {
  spec: Extract<CustomBlockSpec, { type: "checklist" | "steps" }>;
}) {
  const ordered = spec.type === "steps";
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <Title title={spec.title} />
      <List className="mt-6 grid gap-3">
        {spec.items.map((item, index) => (
          <li key={item.label} className="flex gap-3 rounded-2xl border border-border bg-card/40 p-4">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary"
            >
              {ordered ? index + 1 : "✓"}
            </span>
            <span>
              <span className="block text-[15px] font-medium">{item.label}</span>
              {item.body ? (
                <span className="mt-1 block text-[14px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </List>
    </div>
  );
}

function Tabbed({ spec }: { spec: Extract<CustomBlockSpec, { type: "tabs" }> }) {
  const [active, setActive] = useState(0);
  const current = spec.items[active] ?? spec.items[0];
  return (
    <div>
      <Title title={spec.title} />
      <div role="tablist" aria-label={spec.title ?? "Details"} className="mt-6 flex flex-wrap gap-2">
        {spec.items.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={`min-h-11 rounded-full border px-4 text-[14px] transition ${
              index === active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {current ? (
        <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">
          {current.body}
        </p>
      ) : null}
    </div>
  );
}

function Figures({ spec }: { spec: Extract<CustomBlockSpec, { type: "metrics" }> }) {
  return (
    <div>
      <Title title={spec.title} />
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {spec.items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-card/40 p-4">
            <dt className="text-[13px] text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 font-display text-[26px] font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CustomBlock({ spec }: { spec: CustomBlockSpec }) {
  switch (spec.type) {
    case "calculator":
      return <Estimator spec={spec} />;
    case "quiz":
      return <GuidedPicker spec={spec} />;
    case "comparison":
      return <ComparisonTable spec={spec} />;
    case "checklist":
    case "steps":
      return <ItemList spec={spec} />;
    case "tabs":
      return <Tabbed spec={spec} />;
    case "metrics":
      return <Figures spec={spec} />;
  }
}
