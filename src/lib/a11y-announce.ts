import type { TaskNode } from "@/lib/builder/task-tree";

/**
 * Screen-reader messages for JC-62. Pure so they can be tested without a DOM.
 * A live region only announces a change, so these return "" when there is
 * nothing new to say (first read, no change, or the count went down).
 */

/** "2 new failures" when the failed count grew since the last read; "" otherwise. */
export function newFailureAnnouncement(previous: number | null, next: number): string {
  if (previous === null || next <= previous) return "";
  const added = next - previous;
  return `${added} new ${added === 1 ? "failure" : "failures"} in the AI City. ${next} failed in total.`;
}

/** The step Jarvis is on now, or the last one recorded, in words (never colour or an icon alone). */
export function stepAnnouncement(nodes: readonly Pick<TaskNode, "label" | "status">[]): string {
  if (!nodes.length) return "";
  const running = nodes.find((node) => node.status === "running");
  if (running) return `Jarvis is working on: ${running.label}`;
  const failed = [...nodes].reverse().find((node) => node.status === "failed");
  if (failed) return `Step failed: ${failed.label}`;
  const last = nodes[nodes.length - 1];
  return last ? `Step done: ${last.label}` : "";
}

/** Plain-words state for a district map marker, so state is never colour alone. */
export function districtStateWord(state: string, failed: boolean): string {
  if (failed) return "Failed";
  if (state === "working") return "Working";
  if (state === "attention") return "Needs attention";
  if (state === "unavailable") return "Unavailable";
  return "Idle";
}
