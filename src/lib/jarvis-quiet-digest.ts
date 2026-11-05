/**
 * JC-46: collapse adjacent quiet system notices into one "N quiet notices"
 * digest row so Dependabot-style noise does not fill the chat.
 */
import { parseEventNotice, type EventNotice } from "@/lib/jarvis-event-notice";

export type QuietDigestRow = {
  id: string;
  notice: EventNotice;
  createdAt: string;
};

export type FoldedChatItem<T extends { id: string; role: "user" | "assistant"; content: string; created_at: string }> =
  | { kind: "row"; row: T }
  | { kind: "quiet-digest"; rows: QuietDigestRow[] };

/**
 * Walks chat rows in order. A run of two or more adjacent quiet event notices
 * becomes one digest; a single quiet notice and every non-quiet / non-notice
 * row stay as ordinary rows. Dependabot stays quiet.
 */
export function foldQuietNotices<T extends { id: string; role: "user" | "assistant"; content: string; created_at: string }>(
  rows: readonly T[],
): FoldedChatItem<T>[] {
  const out: FoldedChatItem<T>[] = [];
  let pending: QuietDigestRow[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    if (pending.length === 1) {
      const only = pending[0]!;
      const original = rows.find((row) => row.id === only.id);
      if (original) out.push({ kind: "row", row: original });
    } else {
      out.push({ kind: "quiet-digest", rows: pending });
    }
    pending = [];
  };

  for (const row of rows) {
    if (row.role !== "assistant") {
      flush();
      out.push({ kind: "row", row });
      continue;
    }
    const notice = parseEventNotice(row.content);
    if (notice?.quiet) {
      pending.push({ id: row.id, notice, createdAt: row.created_at });
      continue;
    }
    flush();
    out.push({ kind: "row", row });
  }
  flush();
  return out;
}

export function quietDigestLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 quiet notice" : `${n} quiet notices`;
}
