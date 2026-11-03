/**
 * The builder chat's "still building" reply, and how it is shown once the
 * build it talked about is over.
 *
 * The planner answers a request sent during a first build with
 * DEFERRED_BUILD_REPLY and the turn is saved in the chat history. Reopened
 * later, that saved line still read "your AI team is finishing the first
 * website now" although no build was running any more. The line is only kept
 * as-is while a build job is really alive; otherwise it is shown in the past
 * tense with what to do next.
 *
 * Pure and browser-safe.
 */
import { jobIsActive, type JobLivenessRow } from "@/lib/builder/job-liveness";

export const DEFERRED_BUILD_PREFIX = "Got it — your AI team is finishing the first website now";

/** What the owner sees on a follow-up held while a build runs; it is applied at the next safe stop (the build finishing). */
export const QUEUED_FOLLOWUP_LABEL = "Queued, will apply next";
export const QUEUED_FOLLOWUP_REPLY = `${DEFERRED_BUILD_PREFIX}. ${QUEUED_FOLLOWUP_LABEL}: I'll apply this change as soon as the build finishes (usually a few minutes). Keep this window open.`;

export const SETTLED_BUILD_REPLY =
  "This request came in while a website build was running. That build has finished or stopped, so if the change isn't on your site yet, send it again.";

export const NO_BUILD_REPLY =
  "No website build is running right now, so there is no page to change yet. Start your website build first, then send this request again.";

/** A queued job nobody picked up for this long is not a build in progress. */
export const STALE_QUEUED_MS = 30 * 60 * 1000;

export function isDeferredBuildReply(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trimStart().startsWith(DEFERRED_BUILD_PREFIX);
}

type JobRow = JobLivenessRow & { created_at?: string | null };

/**
 * True when a build job is really being worked on. Adds one rule to the shared
 * liveness check: a `queued` row that has not moved for STALE_QUEUED_MS is a
 * leftover, not a build.
 */
export function buildJobRunning(rows: readonly JobRow[] | null | undefined, now = Date.now()): boolean {
  return (rows ?? []).some((row) => {
    if (row.status === "queued") {
      const touched = Date.parse(row.updated_at ?? row.created_at ?? "");
      if (Number.isFinite(touched) && now - touched > STALE_QUEUED_MS) return false;
    }
    return jobIsActive(row, now);
  });
}

/** Restored chat turns: rewrite a stale "still building" reply when no build runs. */
export function settleDeferredReplies<T extends { reply?: string | null | undefined; restored?: boolean | undefined }>(
  tasks: readonly T[],
  buildRunning: boolean,
): T[] {
  if (buildRunning) return [...tasks];
  return tasks.map((task) => (task.restored && isDeferredBuildReply(task.reply) ? { ...task, reply: SETTLED_BUILD_REPLY } : task));
}

/** Same rule for the plain conversation turns handed to the planner and shown in chat. */
export function settleDeferredTurns<T extends { role: string; content: string }>(turns: readonly T[], buildRunning: boolean): T[] {
  if (buildRunning) return [...turns];
  return turns.map((turn) => (turn.role === "assistant" && isDeferredBuildReply(turn.content) ? { ...turn, content: SETTLED_BUILD_REPLY } : turn));
}
