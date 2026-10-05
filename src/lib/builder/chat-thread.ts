/**
 * Builder chat thread model (spec A).
 *
 * Pure and dependency-free so the browser, server and tests share one
 * definition of:
 *  - request ids: every saved turn carries the id of the request that produced
 *    it, so a reply is always tied to its request (and the server's idempotency
 *    key is the same id the chat stores);
 *  - message kinds: a structured type per turn instead of guessing from text;
 *  - branches: alternate directions ("try a darker look") kept side by side
 *    with the main conversation, never overwriting it;
 *  - search: case-insensitive, accent-insensitive search across saved turns.
 */

export const MESSAGE_KINDS = ["text", "plan", "result", "question", "error", "voice", "system"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MAIN_BRANCH = "main";
const REQUEST_ID = /^[A-Za-z0-9_-]{4,80}$/;
const BRANCH = /^[a-z0-9_-]{1,40}$/;

/** A request id safe to store (DB check: ^[A-Za-z0-9_-]{4,80}$), or null. */
export function normaliseRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Retries keep the base id ("t123~r9" -> "t123_r9") so they stay grouped.
  const id = value.replace(/~/g, "_").slice(0, 80);
  return REQUEST_ID.test(id) ? id : null;
}

/** The request a retry belongs to: "t123_r9" and "t123" share "t123". */
export function baseRequestId(id: string): string {
  return id.split(/[~_]r/)[0] ?? id;
}

/** Turns free text into a valid branch key ("Darker look!" -> "darker-look"). */
export function normaliseBranch(value: unknown): string {
  if (typeof value !== "string") return MAIN_BRANCH;
  const key = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return BRANCH.test(key) ? key : MAIN_BRANCH;
}

export function isMessageKind(value: unknown): value is MessageKind {
  return typeof value === "string" && (MESSAGE_KINDS as readonly string[]).includes(value);
}

/**
 * The structured kind of a turn. Explicit kinds win; otherwise a user turn is
 * text and an assistant turn is a result when it carries a task result, an
 * error when that result failed, or text.
 */
export function kindForTurn(turn: {
  role: "user" | "assistant";
  kind?: unknown;
  taskResult?: { state?: string } | null;
}): MessageKind {
  if (isMessageKind(turn.kind)) return turn.kind;
  if (turn.role === "user") return "text";
  if (turn.taskResult?.state === "failed") return "error";
  if (turn.taskResult) return "result";
  return "text";
}

export type ThreadTurn = {
  role: "user" | "assistant";
  content: string;
  at: string;
  requestId?: string | null;
  kind?: MessageKind;
  branch?: string;
};

/** Branch names present in the turns, main first, then by first appearance. */
export function listBranches(turns: readonly ThreadTurn[]): string[] {
  const seen = new Set<string>([MAIN_BRANCH]);
  for (const turn of turns) seen.add(turn.branch ?? MAIN_BRANCH);
  return [...seen];
}

/** Turns of one branch. Alternate branches inherit nothing silently. */
export function turnsForBranch<T extends ThreadTurn>(turns: readonly T[], branch: string): T[] {
  return turns.filter((turn) => (turn.branch ?? MAIN_BRANCH) === branch);
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type SearchHit<T> = { turn: T; index: number; snippet: string };

/**
 * Case- and accent-insensitive search across turns. Every whitespace-separated
 * term must appear. Returns a short snippet around the first match.
 */
export function searchTurns<T extends ThreadTurn>(turns: readonly T[], query: string, limit = 20): SearchHit<T>[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit<T>[] = [];
  turns.forEach((turn, index) => {
    if (hits.length >= limit) return;
    const text = fold(turn.content);
    if (!terms.every((term) => text.includes(term))) return;
    const at = text.indexOf(terms[0]!);
    const start = Math.max(0, at - 40);
    const end = Math.min(turn.content.length, at + terms[0]!.length + 60);
    hits.push({
      turn,
      index,
      snippet: `${start > 0 ? "…" : ""}${turn.content.slice(start, end).trim()}${end < turn.content.length ? "…" : ""}`,
    });
  });
  return hits;
}

/** Groups turns by request id so a request and every reply to it stay together. */
export function groupByRequest<T extends ThreadTurn>(turns: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const turn of turns) {
    if (!turn.requestId) continue;
    const key = baseRequestId(turn.requestId);
    const list = groups.get(key) ?? [];
    list.push(turn);
    groups.set(key, list);
  }
  return groups;
}
