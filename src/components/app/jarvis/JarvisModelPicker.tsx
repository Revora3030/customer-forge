import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJarvisModelPicker } from "@/lib/jarvis-model-picker.functions";
import { healthLabel, paidPickWarning, type PickerModel } from "@/lib/jarvis-model-picker";

const FAMILIES = [
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["google", "Google"],
  ["other", "Other"],
] as const;

type Props = {
  value: string | null;
  onChange: (model: string | null) => void;
  /** Compact label used on the website admin bar. */
  label?: string;
  className?: string;
  selectClassName?: string;
};

function optionText(model: PickerModel): string {
  const paid = model.paid === true ? " · paid" : "";
  return `${model.label} · ${healthLabel(model.health)}${paid}`;
}

/**
 * JC-38: per-chat model chooser. Auto is the platform default. Only models the
 * gateway can try are listed, with recorded health when available. Picking a
 * paid model shows the cost warning; the existing paid-budget gate still
 * enforces the cap on the server.
 */
export function JarvisModelPicker({ value, onChange, label = "Model", className, selectClassName }: Props) {
  const load = useServerFn(getJarvisModelPicker);
  const q = useQuery({ queryKey: ["jarvis", "model-picker"], queryFn: () => load(), staleTime: 60_000, retry: false });
  const models = q.data?.models ?? [];
  const selected = models.find((m) => m.id === value) ?? null;
  const warning = paidPickWarning(selected, q.data?.paidBudget ?? null);
  // Keep a stale pick visible as a single option until the owner switches away,
  // so a registry change mid-session does not silently reset the choice.
  const stale = value && !selected ? value : null;

  return (
    <div className={className ?? "mb-1.5"}>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">{label}</span>
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          aria-label="Chat model"
          disabled={q.isLoading}
          className={selectClassName ?? "h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-w-xs"}
        >
          <option value="">Auto (platform default)</option>
          {stale ? <option value={stale}>{stale} (no longer listed)</option> : null}
          {q.isError ? <option disabled>Couldn't load models — Auto only</option> : null}
          {!q.isError && q.data && !q.data.configured ? (
            <option disabled>AI provider not configured</option>
          ) : null}
          {FAMILIES.map(([family, familyLabel]) => {
            const group = models.filter((m) => m.family === family);
            if (!group.length) return null;
            return (
              <optgroup key={family} label={familyLabel}>
                {group.map((m) => (
                  <option key={m.id} value={m.id}>
                    {optionText(m)}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {warning ? (
        <p role="status" className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}
      {q.isError ? (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          Model list unavailable. Auto (platform default) still works.
        </p>
      ) : null}
    </div>
  );
}
