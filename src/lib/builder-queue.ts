/**
 * REVORA BUILDER QUEUE — pure state for queued requests and editable plans.
 *
 * The owner can line up several requests ("make the home page premium", "add a
 * services page", "improve mobile") and Revora works through them one at a
 * time. Each request produces a plan whose steps can be edited, skipped,
 * reordered or removed before anything touches the draft.
 *
 * Pure functions only: no network, no timers. The panel owns the effects, so
 * the state machine can be tested exactly as the owner experiences it.
 */

export type QueueState =
  "queued" | "planning" | "waiting_for_approval" | "building" | "complete" | "failed" | "skipped";

export type PlanStep = {
  key: string;
  title: string;
  where: string;
  destructive: boolean;
  /** Unapproved steps are never sent to the builder. */
  included: boolean;
};

export type QueueTask = {
  id: string;
  instruction: string;
  state: QueueState;
  /** Plan steps, once Revora has worked the request out. */
  steps: PlanStep[];
  /** Revora's own words about the request. */
  reply?: string;
  summary?: string;
  questions: string[];
  /** Real result of the build, never assumed. */
  applied?: number;
  failedCount?: number;
  error?: string;
  retryable?: boolean;
};

export const QUEUE_LABELS: Record<QueueState, string> = {
  queued: "Waiting",
  planning: "Working it out",
  waiting_for_approval: "Needs your OK",
  building: "Building",
  complete: "Done",
  failed: "Didn't work",
  skipped: "Skipped",
};

let counter = 0;

export function newTask(instruction: string): QueueTask {
  counter += 1;
  const text = instruction.trim().slice(0, 1200);
  return {
    id: `t${Date.now().toString(36)}${counter}`,
    instruction: text,
    state: "queued",
    steps: [],
    questions: [],
  };
}

/** The next request to work on — one at a time, so builds can't collide. */
export function nextRunnable(tasks: QueueTask[]): QueueTask | null {
  const active = tasks.find((task) => task.state === "planning" || task.state === "building");
  if (active) return null;
  return tasks.find((task) => task.state === "queued") ?? null;
}

export function updateTask(tasks: QueueTask[], id: string, patch: Partial<QueueTask>): QueueTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
}

export function toPlanSteps(
  steps: { key: string; title: string; where: string; destructive?: boolean }[],
): PlanStep[] {
  return steps.map((step) => ({
    key: step.key,
    title: step.title,
    where: step.where,
    destructive: Boolean(step.destructive),
    included: true,
  }));
}

/** Steps the owner actually approved, in the order they arranged them. */
export function approvedSteps(task: QueueTask): PlanStep[] {
  return task.steps.filter((step) => step.included);
}

/**
 * A plan may be applied without asking when every step keeps existing content
 * and Revora has nothing to ask. Anything else waits for an explicit press.
 */
export function canAutoApply(task: QueueTask): boolean {
  const steps = approvedSteps(task);
  return steps.length > 0 && task.questions.length === 0 && !steps.some((s) => s.destructive);
}

export function toggleStep(task: QueueTask, key: string): QueueTask {
  return {
    ...task,
    steps: task.steps.map((step) =>
      step.key === key ? { ...step, included: !step.included } : step,
    ),
  };
}

export function removeStep(task: QueueTask, key: string): QueueTask {
  return { ...task, steps: task.steps.filter((step) => step.key !== key) };
}

export function moveStep(task: QueueTask, key: string, direction: -1 | 1): QueueTask {
  const index = task.steps.findIndex((step) => step.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= task.steps.length) return task;
  const steps = [...task.steps];
  const [moved] = steps.splice(index, 1);
  steps.splice(target, 0, moved!);
  return { ...task, steps };
}

/**
 * Decides the honest terminal state for a plan that came back empty.
 *
 * A plan with zero steps is a real outcome, not a dropped result: the engine
 * read the request and found nothing safe to change. If there are follow-up
 * questions, the owner must answer them (the panel surfaces them and offers
 * "Continue in chat"). Otherwise the request is a failure the owner can retry
 * or remove — never a silent hold with no button anywhere on it.
 */
export function terminalStateForEmptyPlan(input: {
  steps: PlanStep[];
  questions: string[];
  unavailable?: { retryable?: boolean } | null;
}): QueueState {
  const { steps, questions } = input;
  if (steps.length > 0) return "waiting_for_approval";
  if (questions.length > 0) return "waiting_for_approval";
  return "failed";
}

/** One honest sentence about the queue, never rounded up. */
export function queueSummary(tasks: QueueTask[]): string {
  if (tasks.length === 0) return "";
  const done = tasks.filter((t) => t.state === "complete").length;
  const failed = tasks.filter((t) => t.state === "failed").length;
  const waiting = tasks.filter(
    (t) => t.state === "queued" || t.state === "waiting_for_approval",
  ).length;
  const parts = [`${done} done`];
  if (waiting) parts.push(`${waiting} waiting`);
  if (failed) parts.push(`${failed} didn't work`);
  return parts.join(" · ");
}
