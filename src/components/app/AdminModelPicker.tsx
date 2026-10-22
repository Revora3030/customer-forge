import { LOVABLE_CONVERSATION_MODELS, modelDisplayName } from "@/lib/ai/lovable-models";

const FAMILIES = [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["google", "Google"]] as const;

/** Super-admin only: lead with one Lovable model; the rest stay as backup. */
export function AdminModelPicker({ value, onChange }: { value: string | null; onChange: (model: string | null) => void }) {
  return (
    <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">Model (admin)</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Auto (best per job)</option>
        {FAMILIES.map(([family, label]) => (
          <optgroup key={family} label={label}>
            {LOVABLE_CONVERSATION_MODELS.filter((id) => id.startsWith(`${family}/`)).map((id) => <option key={id} value={id}>{modelDisplayName(id)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
