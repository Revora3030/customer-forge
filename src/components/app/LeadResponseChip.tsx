import { responseLabel, responseStatus, type ResponseLead } from "@/lib/lead-first-response";

/** "First reply in 3m" / "Waiting 12m" on a lead, red once the 5-minute goal has passed unanswered. */
export function LeadResponseChip({ lead, now, className = "" }: { lead: ResponseLead; now?: number; className?: string }) {
  const status = responseStatus(lead, now);
  const label = responseLabel(status);
  if (!label) return null;
  const tone =
    status.kind === "waiting"
      ? status.overdue
        ? "text-destructive"
        : "text-muted-foreground"
      : status.kind === "answered" && status.withinGoal
        ? "text-success"
        : "text-muted-foreground";
  return (
    <span className={`text-xs ${tone} ${className}`} data-response={status.kind}>
      {label}
    </span>
  );
}
