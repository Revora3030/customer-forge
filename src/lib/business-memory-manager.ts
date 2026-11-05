/**
 * JC-41: pure helpers for the "What Revora remembers" card in Settings. The
 * notes themselves live in the PAI-6 store (business_memory); nothing here
 * writes. Search and filters only narrow what is listed, never what is kept.
 */
import { describeSource, type BusinessMemoryRow, type MemoryKind } from "@/lib/business-memory";

/** How long the Undo button stays after a delete (the server allows a little longer). */
export const UNDO_SECONDS = 30;

export const NOTE_FILTERS = ["all", "needs_confirm", "confirmed"] as const;
export type NoteFilter = (typeof NOTE_FILTERS)[number];

export const FILTER_LABEL: Record<NoteFilter, string> = {
  all: "All",
  needs_confirm: "Needs your OK",
  confirmed: "Confirmed",
};

export const KIND_LABEL: Record<MemoryKind, string> = {
  fact: "Fact",
  tone_rule: "Tone rule",
  style_preference: "Style preference",
};

const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

export function matchesFilter(row: Pick<BusinessMemoryRow, "status">, filter: NoteFilter): boolean {
  if (filter === "needs_confirm") return row.status === "proposed";
  if (filter === "confirmed") return row.status === "confirmed";
  return true;
}

/** Every typed word must appear in the label, the text or the kind. */
export function matchesQuery(row: Pick<BusinessMemoryRow, "key" | "value" | "kind">, query: string): boolean {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = norm(`${row.key} ${row.value} ${KIND_LABEL[row.kind]}`);
  return words.every((word) => haystack.includes(word));
}

export function filterNotes(rows: readonly BusinessMemoryRow[], options: { query: string; filter: NoteFilter }): BusinessMemoryRow[] {
  return rows.filter((row) => matchesFilter(row, options.filter) && matchesQuery(row, options.query));
}

/** Pinned notes first, otherwise the order the server gave (newest first). */
export function orderNotes(rows: readonly BusinessMemoryRow[], pinned: ReadonlySet<string>): BusinessMemoryRow[] {
  return [...rows.filter((row) => pinned.has(row.id)), ...rows.filter((row) => !pinned.has(row.id))];
}

export function countByFilter(rows: readonly Pick<BusinessMemoryRow, "status">[]): Record<NoteFilter, number> {
  return {
    all: rows.length,
    needs_confirm: rows.filter((row) => row.status === "proposed").length,
    confirmed: rows.filter((row) => row.status === "confirmed").length,
  };
}

const dateText = (iso: string | null | undefined) => {
  const at = iso ? new Date(iso) : null;
  return at && Number.isFinite(at.getTime()) ? at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
};

/** "Why was this saved": the plain-words source, the quote if one was kept, and the date. */
export function whySaved(row: BusinessMemoryRow): { source: string; quote: string | null; saved: string | null; confirmed: string | null } {
  const quote = row.source_quote?.trim();
  return {
    source: describeSource(row),
    quote: quote ? quote : null,
    saved: dateText(row.created_at),
    confirmed: row.status === "confirmed" ? dateText(row.confirmed_at) : null,
  };
}

const ACTION_TEXT: Record<string, string> = {
  proposed: "Suggested",
  confirmed: "Confirmed",
  edited: "Edited",
  superseded: "Replaced by a newer note",
  deleted: "Deleted",
  restored: "Restored after a delete",
};

/** One line of change history. Unknown actions are shown as recorded, never hidden. */
export function historyLine(event: { action: string; actor_kind: string; created_at: string }): string {
  const who = event.actor_kind === "owner" ? "you" : event.actor_kind === "agent" ? "the assistant" : "the system";
  const when = dateText(event.created_at);
  return `${ACTION_TEXT[event.action] ?? event.action} by ${who}${when ? ` · ${when}` : ""}`;
}

/** Pinning is a local view preference (this browser only); it changes nothing the assistant reads. */
export const pinsKey = (organizationId: string) => `revora:memory-pins:${organizationId}`;

type PinStorage = Pick<Storage, "getItem" | "setItem">;

export function readPins(organizationId: string, storage: PinStorage | null | undefined): Set<string> {
  try {
    const raw = storage?.getItem(pinsKey(organizationId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 200) : []);
  } catch {
    return new Set();
  }
}

export function writePins(organizationId: string, pins: ReadonlySet<string>, storage: PinStorage | null | undefined): void {
  try {
    storage?.setItem(pinsKey(organizationId), JSON.stringify([...pins].slice(0, 200)));
  } catch {
    /* a full or blocked store only means pins are not remembered */
  }
}

export function togglePin(pins: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(pins);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
