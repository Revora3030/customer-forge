/**
 * Remembers which Jarvis proposals the owner already approved, on this device.
 *
 * Approval state used to live only in component state, so after a reload an
 * approved pull request, Claude Code task or demo build showed its Approve
 * button again. This keeps a small client-side record keyed
 * `${message.id}:${index}`. It is a convenience only: the server is still the
 * source of truth, and server-side idempotency is not claimed here.
 */

export const APPROVALS_KEY = "jarvis:approvals";
export const MAX_APPROVALS = 200;

export type ApprovalRecord = { state: "done"; url?: string | undefined };
export type Approvals = Record<string, ApprovalRecord>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function clean(value: unknown): Approvals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Approvals = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { state?: unknown; url?: unknown };
    if (record.state !== "done") continue;
    out[key] = typeof record.url === "string" && /^https:\/\//.test(record.url) ? { state: "done", url: record.url } : { state: "done" };
  }
  return capped(out);
}

/** Keeps only the newest MAX_APPROVALS entries (insertion order is age order). */
function capped(approvals: Approvals): Approvals {
  const entries = Object.entries(approvals);
  if (entries.length <= MAX_APPROVALS) return approvals;
  return Object.fromEntries(entries.slice(entries.length - MAX_APPROVALS));
}

export function readApprovals(storage: StorageLike | null = defaultStorage()): Approvals {
  if (!storage) return {};
  try {
    const raw = storage.getItem(APPROVALS_KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Records one approval and returns the updated map. Never throws. */
export function rememberApproval(key: string, record: ApprovalRecord, storage: StorageLike | null = defaultStorage()): Approvals {
  const current = readApprovals(storage);
  delete current[key];
  const next = capped({ ...current, [key]: record.url ? { state: "done", url: record.url } : { state: "done" } });
  if (storage) {
    try {
      storage.setItem(APPROVALS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable or full */
    }
  }
  return next;
}
