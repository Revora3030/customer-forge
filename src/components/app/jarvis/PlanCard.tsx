/**
 * JC-33 / JC-34: numbered multi-step plan card for Jarvis.
 *
 * Approve / Edit / Cancel the plan as a whole. Write/send steps still hit their
 * own PAI-4 approval card after the plan is approved — this card never runs
 * mutations. Progress (done / doing / next) and resume-after-failure are
 * derived in multi-step-plan.ts; progress is saved on this device only.
 */
import { useMemo, useState } from "react";
import { Check, Circle, Loader2, Pencil, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyResume,
  derivePlanSteps,
  effectLabel,
  progressSummary,
  readPlanProgress,
  resumeEligibility,
  writePlanProgress,
  type MultiStepPlan,
  type PlanDecision,
  type PlanStep,
  type PlanStepStatus,
} from "@/lib/jarvis/multi-step-plan";

type Props = {
  plan: MultiStepPlan;
  messageId: string;
  busy?: boolean;
  /** Sends a revise/resume prompt as the owner's next message. */
  onAsk?: ((prompt: string) => void) | undefined;
};

function StatusIcon({ status }: { status: PlanStepStatus }) {
  if (status === "done" || status === "skipped") return <Check className="size-3.5 text-emerald-500" aria-hidden />;
  if (status === "doing") return <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />;
  if (status === "failed") return <X className="size-3.5 text-destructive" aria-hidden />;
  return <Circle className="size-3.5 text-muted-foreground" aria-hidden />;
}

function statusWord(status: PlanStepStatus): string {
  switch (status) {
    case "done":
      return "Done";
    case "doing":
      return "Doing";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Cancelled";
    default:
      return "Next";
  }
}

function saveDecision(messageId: string, decision: PlanDecision, steps: PlanStep[], resumeFrom: number | null = null) {
  return writePlanProgress(messageId, {
    decision,
    stepStatus: Object.fromEntries(steps.map((step) => [step.id, step.status])),
    resumeFrom,
    updatedAt: new Date().toISOString(),
  });
}

export function PlanCard({ plan, messageId, busy = false, onAsk }: Props) {
  const initial = readPlanProgress(messageId);
  const [decision, setDecision] = useState<PlanDecision>(initial?.decision ?? "awaiting");
  const [steps, setSteps] = useState<PlanStep[]>(() => derivePlanSteps(plan, initial));

  const summary = useMemo(() => progressSummary(steps), [steps]);
  const eligibility = useMemo(() => resumeEligibility(steps), [steps]);

  if (decision === "cancelled") {
    return (
      <aside aria-label="Plan cancelled" className="mt-3 rounded-xl border border-border/70 bg-card/40 px-3.5 py-2.5 text-sm text-muted-foreground">
        Plan cancelled. Nothing was changed or sent.
      </aside>
    );
  }

  if (!plan.steps.length) {
    return (
      <aside role="status" className="mt-3 rounded-xl border border-border/70 px-3.5 py-2.5 text-sm text-muted-foreground">
        No steps were recorded for this plan.
      </aside>
    );
  }

  const approve = () => {
    const next = steps.map((step) =>
      step.status === "pending" && !step.requiresApproval ? { ...step, status: "done" as const } : step,
    );
    setSteps(next);
    setDecision("approved");
    saveDecision(messageId, "approved", next);
  };

  const cancel = () => {
    const next = steps.map((step) => (step.status === "pending" || step.status === "doing" ? { ...step, status: "cancelled" as const } : step));
    setSteps(next);
    setDecision("cancelled");
    saveDecision(messageId, "cancelled", next);
  };

  const edit = () => {
    setDecision("editing");
    saveDecision(messageId, "editing", steps);
    onAsk?.(
      `Please revise this plan. Keep the same goal, but adjust the steps:\n${steps.map((step) => `${step.index}. [${effectLabel(step.effect)}] ${step.title}`).join("\n")}`,
    );
  };

  const resume = () => {
    if (!eligibility.canResume || eligibility.fromIndex === null) return;
    const next = applyResume(steps, eligibility.fromIndex);
    setSteps(next);
    setDecision("approved");
    saveDecision(messageId, "approved", next, eligibility.fromIndex);
    onAsk?.(`Resume the plan from step ${eligibility.fromIndex + 1}: ${steps[eligibility.fromIndex]?.title ?? "the failed step"}. Do not redo finished writes.`);
  };

  return (
    <aside aria-label="Multi-step plan" data-testid="jarvis-plan-card" className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Plan · {summary.doneCount}/{summary.total} done</p>
        <p className="text-xs text-muted-foreground">
          {summary.doing ? `Doing: ${summary.doing.title}` : summary.failed ? `Stopped at: ${summary.failed.title}` : summary.next ? `Next: ${summary.next.title}` : "All steps settled"}
        </p>
      </div>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step) => (
          <li key={step.id} className="flex min-h-11 items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
              <StatusIcon status={step.status} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{step.index}. {step.title}</span>
              <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-1.5 py-0.5">{effectLabel(step.effect)}</span>
                <span className="rounded-full border border-border px-1.5 py-0.5">{statusWord(step.status)}</span>
                {step.requiresApproval ? <span className="rounded-full border border-border px-1.5 py-0.5">Needs its own approval</span> : null}
                {step.toolId ? <span className="font-mono">{step.toolId}</span> : null}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {decision === "awaiting" || decision === "editing" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" data-jarvis-tap="" disabled={busy} onClick={approve}>
            Approve plan
          </Button>
          <Button type="button" variant="outline" className="min-h-11" data-jarvis-tap="" disabled={busy || !onAsk} onClick={edit}>
            <Pencil className="size-4" aria-hidden /> Edit
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" data-jarvis-tap="" disabled={busy} onClick={cancel}>
            Cancel
          </Button>
        </div>
      ) : null}
      {decision === "approved" && eligibility.canResume ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" className="min-h-11" data-jarvis-tap="" disabled={busy || !onAsk} onClick={resume}>
            <Play className="size-4" aria-hidden /> Resume from failed step
          </Button>
          <p className="text-xs text-muted-foreground">{eligibility.reason}</p>
        </div>
      ) : null}
      {decision === "approved" && !eligibility.canResume && summary.failed ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">{eligibility.reason}</p>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Write and send steps still need their own approval card. Plan progress is saved on this device.
      </p>
    </aside>
  );
}
