/**
 * Durable design intent for one website.
 *
 * The builder replans against the live site every time, which is safe but
 * forgetful: an owner who said "keep the headline exactly as it is" or "stay on
 * the coastal blue look" had to repeat themselves on every later request. This
 * module keeps a small, plain-language memory of standing instructions so later
 * plans respect them.
 *
 * It only ever records what the owner actually typed — never an invented
 * preference, never a business fact. It is a preference note, not content.
 */

export type DesignMemory = {
  /** Standing instructions, newest first, in the owner's own words. */
  notes: string[];
  updatedAt?: string;
};

const MAX_NOTES = 6;
const MAX_NOTE_LENGTH = 180;

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

/** Reads a stored memory out of the website's generation settings blob. */
export function readDesignMemory(generation: unknown): DesignMemory {
  const blob = (generation ?? {}) as Record<string, unknown>;
  const raw = blob["designMemory"] as Record<string, unknown> | undefined;
  const notes = Array.isArray(raw?.["notes"]) ? (raw["notes"] as unknown[]) : [];
  return {
    notes: notes
      .filter((note): note is string => typeof note === "string")
      .map((note) => clean(note).slice(0, MAX_NOTE_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_NOTES),
    ...(typeof raw?.["updatedAt"] === "string" ? { updatedAt: raw["updatedAt"] as string } : {}),
  };
}

/** Pulls standing rules out of one request, in the owner's own wording. */
export function standingRulesFrom(instruction: string): string[] {
  const sentences = clean(instruction)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => clean(part))
    .filter((part) => part.length >= 8 && part.length <= MAX_NOTE_LENGTH);

  const rules: string[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (STANDING_MARKERS.some((marker) => lower.includes(marker))) rules.push(sentence);
  }
  return rules.slice(0, MAX_NOTES);
}

/** Merges new standing rules into the memory, newest first, without duplicates. */
export function mergeDesignMemory(existing: DesignMemory, instruction: string): DesignMemory {
  const incoming = standingRulesFrom(instruction);
  if (!incoming.length) return existing;

  const seen = new Set<string>();
  const notes: string[] = [];
  for (const note of [...incoming, ...existing.notes]) {
    const key = note.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(note);
    if (notes.length >= MAX_NOTES) break;
  }
  return { notes, updatedAt: new Date().toISOString() };
}

/**
 * Turns the memory into one message the planner reads before deciding anything,
 * so a later request cannot quietly undo a standing instruction.
 */
export function designMemoryBrief(memory: DesignMemory): string | null {
  if (!memory.notes.length) return null;
  return [
    "Standing instructions this website owner has already given. Respect them unless this request overrides one:",
    ...memory.notes.map((note) => `- ${note}`),
  ].join("\n");
}
