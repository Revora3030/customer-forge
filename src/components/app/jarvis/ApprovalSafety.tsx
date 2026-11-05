import type { ApprovalSafety as Safety } from "@/lib/jarvis/approval-safety";
import { safetyLines } from "@/lib/jarvis/approval-safety";

const TONE = {
  caution: "font-semibold text-amber-700 dark:text-amber-400",
  calm: "text-foreground",
  unknown: "text-muted-foreground",
} as const;

/**
 * JC-37: the four-line safety summary on an approval card. The text comes from
 * the action class, never from the model, and it is shared by the chat message
 * card, the chat approvals inbox and the workspace agent approvals panel.
 */
export function ApprovalSafetySummary({
  safety,
  className = "",
}: {
  safety: Safety;
  className?: string;
}) {
  return (
    <div
      data-testid="approval-safety"
      className={`rounded-lg border border-border bg-background/60 p-2 text-xs ${className}`}
    >
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        {safetyLines(safety).map((line) => (
          <div key={line.key} className="contents">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className={`text-right ${TONE[line.tone]}`}>{line.value}</dd>
          </div>
        ))}
      </dl>
      {safety.note ? <p className="mt-1.5 leading-5 text-muted-foreground">{safety.note}</p> : null}
    </div>
  );
}
