/**
 * Pillar 1 (Brain): hierarchical task planning. A master goal is a directed
 * acyclic graph of sub-tasks; this module validates it, orders it into
 * parallelisable levels, and works out what a failure invalidates so a
 * backtrack redoes only the affected branch. Pure: it never runs a task.
 */
export type PlanTask = { id: string; dependsOn: readonly string[] };
export type TaskState = "pending" | "running" | "done" | "failed";

export type PlanProblem = { code: "duplicate_id" | "unknown_dependency" | "self_dependency" | "cycle" | "too_large" | "empty"; detail: string };

export const MAX_PLAN_TASKS = 50;

export function validatePlan(tasks: readonly PlanTask[]): PlanProblem[] {
  const problems: PlanProblem[] = [];
  if (!tasks.length) return [{ code: "empty", detail: "A plan needs at least one task." }];
  if (tasks.length > MAX_PLAN_TASKS) problems.push({ code: "too_large", detail: `A plan holds at most ${MAX_PLAN_TASKS} tasks.` });
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) problems.push({ code: "duplicate_id", detail: task.id });
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (dep === task.id) problems.push({ code: "self_dependency", detail: task.id });
      else if (!ids.has(dep)) problems.push({ code: "unknown_dependency", detail: `${task.id} -> ${dep}` });
    }
  }
  if (!problems.length && executionLevels(tasks) === null) problems.push({ code: "cycle", detail: "Tasks depend on each other in a loop." });
  return problems;
}

/** Tasks grouped so every level only needs earlier levels; tasks in one level can run in parallel. Null when cyclic. */
export function executionLevels(tasks: readonly PlanTask[]): string[][] | null {
  const remaining = new Map(tasks.map((task) => [task.id, new Set(task.dependsOn)]));
  const levels: string[][] = [];
  while (remaining.size) {
    const level = [...remaining].filter(([, deps]) => deps.size === 0).map(([id]) => id).sort();
    if (!level.length) return null;
    levels.push(level);
    for (const id of level) remaining.delete(id);
    for (const deps of remaining.values()) for (const id of level) deps.delete(id);
  }
  return levels;
}

/** Tasks whose dependencies are all done and that have not started. */
export function readyTasks(tasks: readonly PlanTask[], state: Readonly<Record<string, TaskState>>): string[] {
  return tasks
    .filter((task) => (state[task.id] ?? "pending") === "pending" && task.dependsOn.every((dep) => state[dep] === "done"))
    .map((task) => task.id);
}

/** Everything downstream of a failed task: what a backtrack must redo or cancel. */
export function invalidatedBy(tasks: readonly PlanTask[], failedId: string): string[] {
  const hit = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of tasks) {
      if (hit.has(task.id)) continue;
      if (task.dependsOn.some((dep) => dep === failedId || hit.has(dep))) {
        hit.add(task.id);
        grew = true;
      }
    }
  }
  return tasks.filter((task) => hit.has(task.id)).map((task) => task.id);
}
