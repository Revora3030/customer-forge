/**
 * Deterministic intent intelligence for Site Forge.
 *
 * This layer sits before the existing compiler. It does not create actions or
 * touch data; it only makes compound natural-language requests safer to plan.
 */

export type IntentOperation = {
  order: number;
  raw: string;
};

export type IntentIntelligenceResult = {
  safe: boolean;
  instruction: string;
  operations: IntentOperation[];
  duplicatesRemoved: number;
  conflicts: string[];
  ambiguities: string[];
  followUpUsed: boolean;
};

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
const lower = (value: string): string => clean(value).toLowerCase();

const splitClauses = (text: string): string[] => {
  const protectedText = text
    .replace(/\bbefore and after\b/gi, "before⁃and⁃after")
    .replace(/\bterms and conditions\b/gi, "terms⁃and⁃conditions")
    .replace(/\brock and roll\b/gi, "rock⁃and⁃roll");

  return protectedText
    .split(/\s+and then\s+|\s+and also\s+|\s*,\s*and\s+|\s*,\s*then\s+|\s*,\s*also\s+|;\s*|\s+then\s+|\s+also\s+|\s+and\s+/i)
    .map((part) => clean(part.replace(/⁃/g, " ")))
    .filter(Boolean);
};

const VERB_RE = /\b(build|add|create|include|insert|remove|delete|hide|show|enable|disable|rewrite|reword|restyle|redesign|resize|reorder|move|fix|improve|optimi[sz]e|update|change|make)\b/i;
const REMOVE_RE = /\b(remove|delete|hide|disable|take off|take out|get rid of)\b/i;
const ENABLE_RE = /\b(add|create|include|insert|show|enable|bring back|restore)\b/i;
const PRONOUN_RE = /\b(it|that|this|these|those|them|there|the first one|the second one|the other one)\b/i;

const significantTokens = (value: string): string[] =>
  lower(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["the", "and", "for", "with", "make", "this", "that", "page"].includes(token));

const overlap = (a: string, b: string): number => {
  const left = new Set(significantTokens(a));
  const right = new Set(significantTokens(b));
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
};

const equivalentKey = (value: string): string =>
  lower(value)
    .replace(/\bplease\b/g, "")
    .replace(/\bthen\b/g, "")
    .replace(/\balso\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

function hasFollowUpReference(text: string): boolean {
  return PRONOUN_RE.test(text);
}

/**
 * Analyse a request without generating or mutating any builder actions.
 * Hard conflicts are intentionally conservative: when the same apparent
 * subject is both removed/disabled and added/enabled, planning pauses for
 * clarification instead of guessing which instruction wins.
 */
export function analyseIntent(
  instruction: string,
  history: string[] = [],
  carried: string | null = null,
): IntentIntelligenceResult {
  const source = clean(instruction);
  const clauses = splitClauses(source);
  const seen = new Set<string>();
  const operations: IntentOperation[] = [];
  let duplicatesRemoved = 0;

  for (const clause of clauses) {
    const key = equivalentKey(clause);
    if (!key || seen.has(key)) {
      if (key) duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    operations.push({ order: operations.length, raw: clause });
  }

  const conflicts: string[] = [];
  for (let i = 0; i < operations.length; i += 1) {
    for (let j = i + 1; j < operations.length; j += 1) {
      const left = operations[i].raw;
      const right = operations[j].raw;
      if (!((REMOVE_RE.test(left) && ENABLE_RE.test(right)) || (ENABLE_RE.test(left) && REMOVE_RE.test(right)))) continue;
      if (overlap(left, right) >= 2) {
        conflicts.push(`Conflicting instructions refer to the same apparent subject: “${left}” vs “${right}”.`);
      }
    }
  }

  const ambiguities: string[] = [];
  const followUpUsed = hasFollowUpReference(source);
  if (followUpUsed && !carried && history.length === 0) {
    ambiguities.push("The request uses a follow-up reference such as “it”, “that”, or “this”, but there is no prior subject to resolve it against.");
  }

  const meaningful = operations.some((operation) => VERB_RE.test(operation.raw));
  if (!meaningful && source) {
    ambiguities.push("The request does not contain a clear change or build action.");
  }

  const safe = conflicts.length === 0 && ambiguities.length === 0;
  const orderedInstruction = operations.map((operation) => operation.raw).join(" then ");

  return {
    safe,
    instruction: orderedInstruction || source,
    operations,
    duplicatesRemoved,
    conflicts: [...new Set(conflicts)],
    ambiguities: [...new Set(ambiguities)],
    followUpUsed,
  };
}
