import type { SavedTaskResult, SavedTurn } from "@/lib/builder-memory";
import { normaliseBranch, normaliseRequestId } from "@/lib/builder/chat-thread";
import { normaliseSavedTaskResult } from "@/lib/builder-chat-result";

export type SavedRequestPair = {
  instruction: string;
  reply: string;
  at: string;
  taskResult?: SavedTaskResult;
  requestId?: string;
  branch?: string;
};

/** Display-only pairing. Never resumes, queues, or applies saved requests. */
export function pairTurns(turns: SavedTurn[]): SavedRequestPair[] {
  const pairs: SavedRequestPair[] = [];
  const byRequest = new Map<string, SavedRequestPair>();
  const userAt = new Map<number, SavedRequestPair>();
  const key = (branch: string, id: string) => `${branch}\u001f${id}`;
  // Index requests first so a tagged server reply can precede its persisted user turn.
  turns.forEach((turn, index) => {
    if (turn.role !== "user") return;
    const branch = normaliseBranch(turn.branch);
    const id = normaliseRequestId(turn.requestId);
    let pair = id ? byRequest.get(key(branch, id)) : undefined;
    if (!pair) {
      pair = { instruction: turn.content, reply: "", at: turn.at, ...(id ? { requestId: id, branch } : {}) };
      pairs.push(pair);
      if (id) byRequest.set(key(branch, id), pair);
    } else if (pair.instruction !== turn.content) {
      pair.instruction = `${pair.instruction}\n\n${turn.content}`;
    }
    userAt.set(index, pair);
  });
  const latestByBranch = new Map<string, SavedRequestPair>();
  turns.forEach((turn, index) => {
    const branch = normaliseBranch(turn.branch);
    if (turn.role === "user") {
      const pair = userAt.get(index);
      if (pair) latestByBranch.set(branch, pair);
      return;
    }
    const id = normaliseRequestId(turn.requestId);
    // An unknown tagged reply must never attach to a neighboring request.
    if (turn.requestId && !id) return;
    const pair = id ? byRequest.get(key(branch, id)) : latestByBranch.get(branch);
    if (!pair) return;
    pair.reply = pair.reply ? `${pair.reply}\n\n${turn.content}` : turn.content;
    const result = normaliseSavedTaskResult(turn.taskResult, turn.content);
    if (result) pair.taskResult = result;
  });
  return pairs;
}
