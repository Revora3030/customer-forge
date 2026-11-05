/**
 * Device-local dismiss store for Jarvis event notices (JC-47 / #569).
 * Cross-device persistence needs a migration and Adam's OK — do not add one here.
 */

export const NOTICE_DISMISS_STORE = "revora:jarvis-notices-dismissed";

/** Notices the owner dismissed on this device. The message itself stays in the history. */
export function readDismissedNoticeIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTICE_DISMISS_STORE) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-300) : [];
  } catch {
    return [];
  }
}

/** Marks one or more notice message ids dismissed in localStorage (idempotent). */
export function dismissNoticeIds(ids: readonly string[]): void {
  if (ids.length === 0) return;
  try {
    const next = readDismissedNoticeIds();
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    localStorage.setItem(NOTICE_DISMISS_STORE, JSON.stringify(next.slice(-300)));
  } catch {
    /* storage unavailable */
  }
}

export function isNoticeDismissed(id: string): boolean {
  return readDismissedNoticeIds().includes(id);
}
