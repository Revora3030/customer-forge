/**
 * GENERICITY CHECK — flags stock-agency phrasing and copy-pasted filler in
 * generated site content. Every hit is advisory (never a publish blocker):
 * generic phrasing hurts conversion and looks templated, but it never makes
 * a page broken or unsafe the way a fabricated claim or a template leak
 * does, so it should nudge the owner rather than stop a launch.
 */
import type { QualityIssue } from "./quality";

/** Common stock-agency phrases that make a site sound templated. */
const STOCK_PHRASES = [
  "welcome to our website",
  "we are dedicated to providing",
  "we are committed to providing",
  "look no further",
  "your one-stop shop",
  "we pride ourselves on",
  "customer satisfaction is our",
  "quality you can trust",
  "choose your details with clarity",
  "without the guesswork",
  "a straightforward way to choose",
  "ready to choose your",
  "before you request a time",

];

/** Below this length, a repeated line is a normal CTA/label, not filler. */
const FILLER_MIN_LENGTH = 40;
/** A block needs to repeat at least this many times to count as filler. */
const FILLER_MIN_COUNT = 3;

const asText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type GenericPhraseHit = { phrase: string; count: number };

/** Finds stock-agency phrases in the given copy, case-insensitively. */
export function detectGenericPhrases(values: unknown[]): GenericPhraseHit[] {
  const texts = values.map(asText).filter((v): v is string => v !== null);
  const lowered = texts.map((t) => t.toLowerCase());

  const hits: GenericPhraseHit[] = [];
  for (const phrase of STOCK_PHRASES) {
    const count = lowered.filter((t) => t.includes(phrase)).length;
    if (count > 0) hits.push({ phrase, count });
  }
  return hits;
}

/** Finds long blocks of copy repeated verbatim across the site (copy-paste filler). */
export function detectRepeatedFiller(values: unknown[]): GenericPhraseHit[] {
  const texts = values.map(asText).filter((v): v is string => v !== null);

  const counts = new Map<string, number>();
  for (const text of texts) {
    if (text.length <= FILLER_MIN_LENGTH) continue;
    const key = text.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= FILLER_MIN_COUNT)
    .map(([phrase, count]) => ({ phrase, count }));
}

export type GenericityReport = {
  score: number;
  genericPhrases: GenericPhraseHit[];
  repeatedFiller: GenericPhraseHit[];
};

/** Scores copy from 0 (heavily templated) to 100 (fully specific to this business). */
export function scoreGenericity(values: unknown[]): GenericityReport {
  const genericPhrases = detectGenericPhrases(values);
  const repeatedFiller = detectRepeatedFiller(values);

  const penalty =
    genericPhrases.reduce((sum, hit) => sum + hit.count * 12, 0) +
    repeatedFiller.reduce((sum, hit) => sum + hit.count * 18, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score, genericPhrases, repeatedFiller };
}

/** Advisory quality issues for the publish gate — stock phrasing never blocks a launch. */
export function genericityIssues(values: unknown[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const hit of detectGenericPhrases(values)) {
    issues.push({
      key: "generic_stock_phrase",
      severity: "advice",
      detail: `Sounds templated: "${hit.phrase}" appears ${hit.count}x.`,
      fix: "Replace with specific details about this business — a neighborhood, a number, a real guarantee.",
    });
  }

  for (const hit of detectRepeatedFiller(values)) {
    issues.push({
      key: "repeated_filler_copy",
      severity: "advice",
      detail: `The same long block of copy appears ${hit.count}x across the site.`,
      fix: "Write distinct copy for each section instead of repeating the same paragraph.",
    });
  }

  return issues;
}
