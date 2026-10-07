/**
 * Requests the owner sent that have not finished yet.
 *
 * A request lives only in React state while the AI team plans it (often a few
 * minutes). Leaving the builder for the dashboard or preview unmounted the
 * hook and the request vanished: it is only written to the saved conversation
 * once the plan comes back. Every request is now recorded locally the moment
 * it is sent and cleared when it reaches an end state, so coming back restores
 * it and it is worked again under the same request id (the server's
 * idempotency and progress records are keyed on that id).
 *
 * Pure apart from the injected storage, so it is unit-testable and safe on
 * the server (no window → no-op).
 */
import type { AgentAttachment } from "@/lib/site-agent";

export type PendingRequest = {
  id: string;
  instruction: string;
  attachments?: AgentAttachment[];
  sentAt: string;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "rv-builder-pending:";
/** A request older than this is not resumed automatically. */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LIMIT = 10;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function key(organizationId: string) {
  return `${PREFIX}${organizationId}`;
}

export function readPending(organizationId: string, store: Store | null = defaultStore(), now = Date.now()): PendingRequest[] {
  if (!store) return [];
  try {
    const raw = store.getItem(key(organizationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingRequest => {
      if (!item || typeof item !== "object") return false;
      const row = item as PendingRequest;
      if (typeof row.id !== "string" || typeof row.instruction !== "string" || typeof row.sentAt !== "string") return false;
      const age = now - Date.parse(row.sentAt);
      return Number.isFinite(age) && age >= 0 && age <= PENDING_MAX_AGE_MS;
    });
  } catch {
    return [];
  }
}

function write(organizationId: string, rows: PendingRequest[], store: Store | null) {
  if (!store) return;
  try {
    if (rows.length) store.setItem(key(organizationId), JSON.stringify(rows.slice(-LIMIT)));
    else store.removeItem(key(organizationId));
  } catch {
    /* storage full or blocked: the request still runs, it just can't be resumed */
  }
}

export function addPending(organizationId: string, request: PendingRequest, store: Store | null = defaultStore()) {
  const rows = readPending(organizationId, store).filter((row) => row.id !== request.id);
  write(organizationId, [...rows, request], store);
}

/** Removes a request once it completed, failed, was skipped or dismissed. Retries keep the base id. */
export function clearPending(organizationId: string, id: string, store: Store | null = defaultStore()) {
  const base = id.split("~")[0];
  write(
    organizationId,
    readPending(organizationId, store).filter((row) => row.id.split("~")[0] !== base),
    store,
  );
}

export function clearAllPending(organizationId: string, store: Store | null = defaultStore()) {
  write(organizationId, [], store);
}

/**
 * Pending requests that still need to be shown/worked after the saved
 * conversation was loaded. A request whose words already appear as a saved
 * user turn sent after it was queued finished elsewhere, so it is dropped.
 */
export function unresolvedPending(
  pending: PendingRequest[],
  savedUserTurns: { content: string; at: string }[],
): PendingRequest[] {
  return pending.filter(
    (request) =>
      !savedUserTurns.some(
        (turn) => turn.content.trim() === request.instruction.trim() && turn.at >= request.sentAt.slice(0, 19),
      ),
  );
}
