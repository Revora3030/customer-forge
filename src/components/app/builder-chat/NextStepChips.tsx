import { ArrowRight } from "lucide-react";
import type { NextStepChip } from "@/lib/builder/next-step-chips";

/** CU-6 / JC-44: next-step chips under the latest finished reply. */
export function NextStepChips({
  chips,
  disabled = false,
  onPick,
}: {
  chips: NextStepChip[];
  disabled?: boolean;
  onPick: (chip: NextStepChip) => void;
}) {
  if (!chips.length) return null;
  return (
    <div role="group" aria-label="Next steps" className="flex flex-wrap gap-1.5" data-testid="next-step-chips">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          title={chip.reason}
          disabled={disabled}
          onClick={() => onPick(chip)}
          className="inline-flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-card/40 px-3 text-[13px] text-foreground transition-colors hover:border-primary/50 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <ArrowRight className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
