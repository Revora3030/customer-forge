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
  /**
   * Shown as live work that this chat queue does not run or wait on: a first
   * build the build worker runs, or a request still being worked on from
   * another tab or device. Never counted as busy, never offered a retry.
   */
  tracking?: boolean;
};

/**
 * A saved request with no reply yet is treated as still in flight (another
 * tab or device is working on it) for this long after it was sent; only after
 * that is its outcome called unknown and offered a retry.
 */
export const IN_FLIGHT_WINDOW_MS = 30 * 60 * 1000;

export type SavedPair = {
  instruction: string;
  reply: string;
  at: string;
  requestId?: string;
  taskResult?: SavedTaskResult;
};

export const UNKNOWN_OUTCOME =
  "Revora didn't save how this request ended. Check your website, then send it again if nothing changed.";

export function hydrateTasks(pairs: readonly SavedPair[], now: number = Date.now()): ChatTask[] {
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
    if (!pair.reply && !result) {
      const sentAt = Date.parse(pair.at);
      if (Number.isFinite(sentAt) && now - sentAt < IN_FLIGHT_WINDOW_MS) {
        // Sent moments ago and not answered yet: it is probably still being
        // worked on elsewhere. Shown as working, with no retry, so it can't
        // be planned and applied a second time from here.
        task.state = "planning";
        task.tracking = true;
      } else {
        // No reply and no saved outcome: the result was never recorded, so it
        // is never shown as done — the owner can check and send it again.
        task.error = UNKNOWN_OUTCOME;
        task.retryable = true;
      }
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
 * Requests applied live in this session, oldest first. Restored entries
 * (first load, "Load earlier", branch switches) are history, not new changes:
 * they must never re-trigger the screen check, its AI repair or an
 * auto-revert to the version saved before them.
 */
export function appliedThisSession<T extends ChatTask>(tasks: readonly T[]): T[] {
  return tasks.filter((task) => !task.restored && task.state === "complete" && (task.applied ?? 0) > 0);
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
