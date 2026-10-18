/**
 * Rebuilds chat tasks from saved request/result pairs.
 *
 * One definition shared by the first load, "Load earlier messages" and
 * switching branches, so a saved request always comes back the same way:
 * under its own request id, with its stored counts, and never as a made-up
 * "Done." when its outcome was not recorded.
 */
import { newTask, type QueueTask } from "@/lib/builder-queue";
import type { SavedTaskResult } from "@/lib/builder-memory";
import { baseRequestId } from "@/lib/builder/chat-thread";

/**
 * A chat task: the queue's task plus what the result card needs after a
 * reload (owner-language skip reasons and the titles of the planned changes).
 */
export type ChatTask = QueueTask & {
  reasons?: string[];
  titles?: string[];
};

export type SavedPair = {
  instruction: string;
  reply: string;
  at: string;
  requestId?: string;
  taskResult?: SavedTaskResult;
};

export const UNKNOWN_OUTCOME =
  "Revora didn't save how this request ended. Check your website, then send it again if nothing changed.";

export function hydrateTasks(pairs: readonly SavedPair[]): ChatTask[] {
  return pairs.map((pair) => {
    const result = pair.taskResult;
    const task: ChatTask = {
      ...newTask(pair.instruction),
      // The saved request id becomes the task id, so search hits, progress and
      // a later retry all point at the same request.
      ...(pair.requestId ? { id: pair.requestId } : {}),
      state: result?.state ?? (pair.reply ? "complete" : "failed"),
      reply: pair.reply,
      answered: Boolean(pair.reply) && !result,
      restored: true,
    };
    // No reply and no saved outcome: the result was never recorded, so it is
    // never shown as done — the owner can check and send it again.
    if (!pair.reply && !result) {
      task.error = UNKNOWN_OUTCOME;
      task.retryable = true;
    }
    if (result?.applied !== undefined) task.applied = result.applied;
    if (result?.failedCount !== undefined) task.failedCount = result.failedCount;
    if (result?.staleCount !== undefined) task.staleCount = result.staleCount;
    if (result?.snapshotVersion !== undefined) task.snapshotVersion = result.snapshotVersion;
    if (result?.reasons?.length) task.reasons = result.reasons.filter((reason) => typeof reason === "string");
    if (result?.titles?.length) task.titles = result.titles.filter((title) => typeof title === "string");
    // Older saves froze a sentence ("… reached your website …"); the result
    // card now re-reads the counts, so a frozen apply report is not kept.
    if (result?.notice && result.applied === undefined) task.notice = result.notice;
    return task;
  });
}

/**
 * Restored tasks first, then the live ones. A restored request whose base id
 * (retries share it: "t1~r2" and "t1_r2" are both "t1") is already live in
 * this session is not shown a second time.
 */
export function mergeRestored<T extends QueueTask>(restored: readonly T[], live: readonly T[]): T[] {
  const liveIds = new Set(live.map((task) => baseRequestId(task.id)));
  return [...restored.filter((task) => !liveIds.has(baseRequestId(task.id))), ...live];
}
