/**
 * JC-47: group repeat event notices with the same ruleId on the same calendar
 * day into one expandable digest row. Pure: reinterpret chat rows only.
 * Distinct from JC-46's QuietNoticesDigest (adjacent quiet noise).
 */
import { parseEventNotice, type EventNotice } from "@/lib/jarvis-event-notice";

export type NoticeDigestMember = {
  id: string;
  notice: EventNotice;
  createdAt: string;
};

export type FoldedNoticeItem<T extends { id: string; role: string; content: string; created_at: string }> =
  | { kind: "row"; row: T }
  | { kind: "repeat-digest"; key: string; ruleId: string; dayKey: string; members: NoticeDigestMember[] };

/** UTC calendar day (YYYY-MM-DD) so grouping is stable in tests and across zones. */
export function noticeCalendarDayKey(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function repeatDigestKey(ruleId: string, dayKey: string): string {
  return `${ruleId}|${dayKey}`;
}

export function repeatDigestLabel(label: string, count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n <= 1 ? label : `${label} · ${n} today`;
}

/**
 * Walks chat rows in order. Notices sharing a ruleId + UTC day collapse into
 * one digest at the last member's position when count > 1; singles stay rows.
 */
export function foldRepeatNotices<T extends { id: string; role: string; content: string; created_at: string }>(
  rows: readonly T[],
): FoldedNoticeItem<T>[] {
  const buckets = new Map<string, NoticeDigestMember[]>();

  for (const row of rows) {
    if (row.role !== "assistant") continue;
    const notice = parseEventNotice(row.content);
    if (!notice) continue;
    const day = noticeCalendarDayKey(row.created_at);
    if (!day) continue;
    const key = repeatDigestKey(notice.ruleId, day);
    const list = buckets.get(key) ?? [];
    list.push({ id: row.id, notice, createdAt: row.created_at });
    buckets.set(key, list);
  }

  const digestKeys = new Set<string>();
  for (const [key, members] of buckets) {
    if (members.length > 1) digestKeys.add(key);
  }

  const absorbed = new Set<string>();
  const anchorKey = new Map<string, string>();
  for (const key of digestKeys) {
    const members = buckets.get(key)!;
    for (let i = 0; i < members.length - 1; i++) absorbed.add(members[i]!.id);
    anchorKey.set(members[members.length - 1]!.id, key);
  }

  const out: FoldedNoticeItem<T>[] = [];
  for (const row of rows) {
    if (absorbed.has(row.id)) continue;
    const key = anchorKey.get(row.id);
    if (key) {
      const members = buckets.get(key)!;
      const day = noticeCalendarDayKey(members[0]!.createdAt);
      out.push({
        kind: "repeat-digest",
        key,
        ruleId: members[0]!.notice.ruleId,
        dayKey: day,
        members,
      });
      continue;
    }
    out.push({ kind: "row", row });
  }
  return out;
}

/** Message ids a digest dismiss should write into the localStorage store. */
export function repeatDigestMemberIds(members: readonly NoticeDigestMember[]): string[] {
  return members.map((member) => member.id);
}
