/**
 * LONG-SESSION MEMORY — the builder's durable project journal.
 *
 * `design-memory` keeps a handful of standing style rules inside the website's
 * own settings. This module is the wider, durable record of the working
 * relationship for one website: the requests the owner made, what actually got
 * done, the standing rules they stated, and the attempts that did not work.
 * It survives page reloads, new sessions and new devices, so a request made
 * three weeks ago still informs the next plan.
 *
 * Rules it lives by:
 * - It records only the owner's own words and Revora's own measured outcomes.
 *   Never an invented preference, never a business fact, never a claim.
 * - It is guidance for planning, never a source of truth: every build still
 *   reads the live website before it changes anything.
 * - It is bounded and pruneable, and the owner can forget any entry.
 *
 * Pure functions only — no database, no network, so it is fully testable.
 */

export type MemoryKind =
  /** A standing instruction in the owner's own words ("always keep the hero blue"). */
  | "rule"
  /** Something the owner asked for, kept verbatim. */
  | "decision"
  /** What the build actually did, as measured after the writes. */
  | "outcome"
  /** Something that did not work, so it is not retried blindly. */
  | "avoid";

export type MemoryEntry = {
  id?: string;
  kind: MemoryKind;
  text: string;
  /** Pinned entries are kept first and never pruned away. */
  pinned?: boolean;
  createdAt?: string;
};

/** Keeps the journal useful rather than endless. Pinned entries are exempt. */
export const MEMORY_LIMIT = 40;
export const MEMORY_TEXT_LIMIT = 220;
/** The brief handed to the planner stays small so recall never crowds out the request. */
export const MEMORY_BRIEF_LIMIT = 1400;

/**
 * Phrases that mark a sentence as a standing rule rather than a one-off task.
 * "Make the hero blue" is a task. "Always keep the hero blue" is a rule.
 */
const STANDING_MARKERS = [
  "always",
  "never",
  "keep",
  "don't change",
  "dont change",
  "do not change",
  "stick to",
  "stay on",
  "from now on",
  "every page",
  "site-wide",
  "sitewide",
  "leave the",
  "exactly as",
  "prefer",
  "no more",
];

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function normaliseMemoryText(value: string): string {
  return clean(value).slice(0, MEMORY_TEXT_LIMIT);
}

/** A stable identity for an entry so the same note is never stored twice. */
export function memoryKey(entry: Pick<MemoryEntry, "kind" | "text">): string {
  const text = entry.text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${entry.kind}:${text}`;
}

const sentences = (value: string) =>
  clean(value)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter(Boolean);

/**
 * Turns one completed exchange into journal entries.
 *
 * `instruction` is the owner's own message. `summary`, `applied` and `failed`
 * are Revora's own measured results from the apply step — nothing here is
 * generated prose, so the journal cannot drift into invention.
 */
export function extractMemories(input: {
  instruction: string;
  summary?: string | null;
  applied?: string[];
  failed?: string[];
}): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  const instruction = clean(input.instruction ?? "");

  for (const sentence of sentences(instruction)) {
    const lower = sentence.toLowerCase();
    if (!STANDING_MARKERS.some((marker) => lower.includes(marker))) continue;
    out.push({ kind: "rule", text: normaliseMemoryText(sentence) });
  }

  if (instruction) out.push({ kind: "decision", text: normaliseMemoryText(instruction) });

  const applied = (input.applied ?? []).filter(Boolean);
  const summary = clean(input.summary ?? "");
  if (applied.length) {
    const what = summary || applied.slice(0, 3).join("; ");
    out.push({
      kind: "outcome",
      text: normaliseMemoryText(
        `Done (${applied.length} change${applied.length === 1 ? "" : "s"}): ${what}`,
      ),
    });
  }

  for (const label of (input.failed ?? []).filter(Boolean).slice(0, 2)) {
    out.push({ kind: "avoid", text: normaliseMemoryText(`Did not work: ${label}`) });
  }

  return dedupeCandidates(out);
}

function dedupeCandidates(entries: MemoryEntry[]): MemoryEntry[] {
  const seen = new Set<string>();
  const out: MemoryEntry[] = [];
  for (const entry of entries) {
    if (!entry.text) continue;
    const key = memoryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** The candidates that are genuinely new against what is already remembered. */
export function newMemories(existing: MemoryEntry[], candidates: MemoryEntry[]): MemoryEntry[] {
  const known = new Set(existing.map((entry) => memoryKey(entry)));
  return dedupeCandidates(candidates).filter((entry) => !known.has(memoryKey(entry)));
}

/**
 * Decides what stays. Pinned entries and standing rules are kept, then the
 * newest of everything else up to the limit. The rest is returned so the caller
 * can delete exactly those rows.
 */
export function pruneMemories(
  entries: MemoryEntry[],
  limit = MEMORY_LIMIT,
): { keep: MemoryEntry[]; drop: MemoryEntry[] } {
  const ordered = [...entries].sort(
    (a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "") || 0,
  );
  const keep: MemoryEntry[] = [];
  const drop: MemoryEntry[] = [];
  for (const entry of ordered) {
    const protected_ = entry.pinned === true || entry.kind === "rule";
    if (protected_ || keep.length < limit) keep.push(entry);
    else drop.push(entry);
  }
  return { keep, drop };
}

const KIND_LABEL: Record<MemoryKind, string> = {
  rule: "Standing instruction",
  decision: "Earlier request",
  outcome: "Already done",
  avoid: "Did not work before",
};

/**
 * A compact recall brief for the planner. Standing rules come first because
 * they constrain the plan; earlier requests and outcomes follow so the builder
 * does not repeat work or contradict itself.
 */
export function memoryBrief(entries: MemoryEntry[], limit = MEMORY_BRIEF_LIMIT): string | null {
  const order: MemoryKind[] = ["rule", "avoid", "outcome", "decision"];
  const lines: string[] = [];
  for (const kind of order) {
    for (const entry of entries.filter((item) => item.kind === kind)) {
      if (!entry.text) continue;
      lines.push(`- ${KIND_LABEL[kind]}: ${entry.text}`);
    }
  }
  if (!lines.length) return null;
  const head =
    "WHAT THIS WORKSPACE ALREADY AGREED (guidance only — the live website is still the source of truth; never treat these as business facts):";
  let body = "";
  for (const line of lines) {
    if (body.length + line.length + 1 > limit) break;
    body += (body ? "\n" : "") + line;
  }
  return body ? `${head}\n${body}` : null;
}
