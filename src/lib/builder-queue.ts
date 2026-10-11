/** Pure request state; no network, timers or publishing side effects. */
import type { CompositionPreview } from "@/lib/builder/composition-preview";
import type { AgentAttachment } from "@/lib/site-agent";

export type QueueState = "queued" | "planning" | "waiting_for_approval" | "building" | "complete" | "failed" | "skipped";
export type PlanStep = {
  key: string;
  title: string;
  where: string;
  destructive: boolean;
  included: boolean;
  before?: string;
  after?: string;
};
export type QueueTask = {
  id: string;
  instruction: string;
  state: QueueState;
  steps: PlanStep[];
  reply?: string;
  answered?: boolean;
  restored?: boolean;
  awaitingReattach?: boolean;
  summary?: string;
  questions: string[];
  requirements?: { label: string; covered: boolean }[];
  applied?: number;
  snapshotVersion?: number | undefined;
  failedCount?: number;
  staleCount?: number;
  partial?: boolean;
  notice?: string;
  details?: string[];
  error?: string;
  retryable?: boolean;
  composition?: CompositionPreview | null;
  attachments?: AgentAttachment[];
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
export function newTask(instruction: string, attachments: AgentAttachment[] = []): QueueTask {
  counter += 1;
  return { id: `t${Date.now().toString(36)}${counter}`, instruction: instruction.trim().slice(0, 1200), state: "queued", steps: [], questions: [], attachments };
}
export function nextRunnable(tasks: QueueTask[]): QueueTask | null {
  if (tasks.some((task) => task.state === "planning" || task.state === "building")) return null;
  return tasks.find((task) => task.state === "queued") ?? null;
}
export function updateTask(tasks: QueueTask[], id: string, patch: Partial<QueueTask>): QueueTask[] {
  return tasks.map((task) => task.id === id ? { ...task, ...patch } : task);
}
export function toPlanSteps(steps: { key: string; title: string; where: string; destructive?: boolean; before?: string; after?: string }[]): PlanStep[] {
  return steps.map((step) => ({ key: step.key, title: step.title, where: step.where, destructive: Boolean(step.destructive), included: true,
    ...(step.before !== undefined ? { before: step.before } : {}), ...(step.after !== undefined ? { after: step.after } : {}) }));
}
export function approvedSteps(task: QueueTask): PlanStep[] {
  return task.steps.filter((step) => step.included);
}
/** Reversible edits may apply automatically; removal or open questions require approval. */
export function canAutoApply(task: QueueTask): boolean {
  const steps = approvedSteps(task);
  return steps.length > 0 && task.questions.length === 0 && steps.every((step) => !step.destructive);
}
export function toggleStep(task: QueueTask, key: string): QueueTask {
  return { ...task, steps: task.steps.map((step) => step.key === key ? { ...step, included: !step.included } : step) };
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
export function terminalStateForEmptyPlan(input: { steps: PlanStep[]; questions: string[]; unavailable?: { retryable?: boolean } | null }): QueueState {
  return input.steps.length > 0 || input.questions.length > 0 ? "waiting_for_approval" : "failed";
}
export function queueSummary(tasks: QueueTask[]): string {
  if (!tasks.length) return "";
  const done = tasks.filter((task) => task.state === "complete" && !task.answered).length;
  const failed = tasks.filter((task) => task.state === "failed").length;
  const waiting = tasks.filter((task) => task.state === "queued" || task.state === "waiting_for_approval").length;
  const parts = [`${done} done`];
  if (waiting) parts.push(`${waiting} waiting`);
  if (failed) parts.push(`${failed} didn't work`);
  return parts.join(" · ");
}
export function timelineFor(task: QueueTask): { stages: string[]; current: number } {
  const total = task.steps.filter((step) => step.included).length;
  const stages = ["Thinking", "Planning", total ? `Applying ${task.applied ?? 0}/${total}` : "Applying", "Validating", task.partial ? "Partly applied" : "Verified"];
  const current = task.state === "queued" ? 0 : task.state === "planning" || task.state === "waiting_for_approval" ? 1 : task.state === "building" ? 2 : task.state === "complete" ? 4 : 3;
  return { stages, current };
}
