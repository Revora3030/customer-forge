import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { INTAKE_FIELDS, intakeCompleteness, intakeGaps, type IntakeValues } from "@/lib/intake-map";
import { CONVERSION_GOALS, normalizeGoal } from "@/lib/conversion-engine";
import { smartIntakeValue } from "@/lib/intake-smart";
import { cn } from "@/lib/utils";

/**
 * One-input intake: the owner fills each fact once, here or in onboarding, and
 * every system downstream reads it. The panel lists exactly what each fact feeds.
 */
export function IntakeHub({
  values,
  canManage,
  isSaving,
  onSave,
}: {
  values: IntakeValues;
  canManage: boolean;
  isSaving: boolean;
  onSave: (patch: IntakeValues) => void;
}) {
  const [draft, setDraft] = useState<IntakeValues>(values);
  useEffect(() => setDraft(values), [values]);

  const progress = intakeCompleteness(draft);
  const gaps = intakeGaps(draft);
  const dirty = INTAKE_FIELDS.some(
    (field) => (draft[field.key] ?? "") !== (values[field.key] ?? ""),
  );

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" /> Your business, entered
            once
          </p>
          <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
            Revora reuses these facts across your pages, SEO, buttons, forms, CRM, booking, offers
            and every future AI upgrade. You never have to type them twice.
          </p>
        </div>
        <Pill tone={gaps.length ? "attention" : "signal"}>
          {progress.filled}/{progress.total} complete
        </Pill>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(progress.percent, 2)}%` }}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {INTAKE_FIELDS.map((field) => {
          const value = draft[field.key] ?? "";
          const missing = field.required && !value.trim();
          return (
            <div key={field.key} className="rounded-md border border-border p-3">
              <label className="block text-[12px] font-medium" htmlFor={`intake-${field.key}`}>
                {field.label}
                {field.required ? <span className="ml-1 text-accent">*</span> : null}
              </label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{field.help}</p>

              {field.kind === "goal" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CONVERSION_GOALS.map((goal) => {
                    const active = normalizeGoal(value) === goal.value && !!value.trim();
                    return (
                      <button
                        key={goal.value}
                        type="button"
                        disabled={!canManage}
                        onClick={() =>
                          setDraft((d) => ({ ...d, [field.key]: goal.label }))
                        }
                        className={cn(
                          "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed",
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground",
                        )}
                        aria-pressed={active}
                        title={goal.blurb}
                      >
                        {goal.label}
                      </button>
                    );
                  })}
                </div>
              ) : field.kind === "textarea" ? (
                <textarea
                  id={`intake-${field.key}`}
                  value={value}
                  disabled={!canManage}
                  rows={3}
                  onChange={(event) => setDraft((d) => ({ ...d, [field.key]: event.target.value }))}
                  onBlur={(event) =>
                    setDraft((d) => ({
                      ...d,
                      [field.key]: smartIntakeValue(field.key, event.target.value),
                    }))
                  }
                  className={cn(
                    "mt-2 w-full rounded-md border bg-background px-2.5 py-2 text-[13px] outline-none focus:border-primary",
                    missing ? "border-accent/60" : "border-border",
                  )}
                />
              ) : (
                <input
                  id={`intake-${field.key}`}
                  value={value}
                  disabled={!canManage}
                  onChange={(event) => setDraft((d) => ({ ...d, [field.key]: event.target.value }))}
                  onBlur={(event) =>
                    setDraft((d) => ({
                      ...d,
                      [field.key]: smartIntakeValue(field.key, event.target.value),
                    }))
                  }
                  inputMode={
                    field.key === "phone" ? "tel" : field.key === "email" ? "email" : "text"
                  }
                  autoComplete={
                    field.key === "phone"
                      ? "tel"
                      : field.key === "email"
                        ? "email"
                        : field.key === "city"
                          ? "address-level2"
                          : field.key === "name"
                            ? "organization"
                            : "off"
                  }
                  autoCapitalize={field.key === "email" ? "none" : "words"}
                  spellCheck={field.key === "email" ? false : undefined}
                  className={cn(
                    "mt-2 w-full rounded-md border bg-background px-2.5 py-2 text-[13px] outline-none focus:border-primary",
                    missing ? "border-accent/60" : "border-border",
                  )}
                />
              )}

              <p className="mt-2 text-[11px] text-muted-foreground">
                Feeds: {field.usedBy.join(" · ")}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {gaps.length ? (
            <>Still needed: {gaps.map((gap) => gap.label.toLowerCase()).join(", ")}.</>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" /> Every system has
              what it needs.
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="signal"
          disabled={!canManage || !dirty || isSaving}
          onClick={() => onSave(draft)}
        >
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save &amp; reuse everywhere
        </Button>
      </div>
    </section>
  );
}

