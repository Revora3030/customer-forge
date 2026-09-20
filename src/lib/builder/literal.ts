/**
 * REVORA LITERAL WORDING DIRECTIVES — "say exactly this".
 *
 * The single most common request an owner makes is not a mood or a new page:
 * it is exact wording. "Change my homepage headline to 'Reliable service, done
 * right' and make the main button say 'Get a free quote'".
 *
 * This module reads those instructions and returns the precise edits they ask
 * for. It runs on plain string work — no model, no network, no cost — and it
 * never invents a value: every directive carries wording the owner typed.
 */

import type { BusinessFactField } from "@/lib/site-agent";

export type LiteralDirective =
  | {
      kind: "section_text";
      field: "heading" | "subheading" | "body";
      value: string;
      sectionKind?: string;
    }
  | { kind: "button_label"; value: string; sectionKind?: string }
  | { kind: "fact"; field: BusinessFactField; value: string };

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/** Section words that tell us which block on the page a clause is about. */
const SECTION_HINTS: [RegExp, string][] = [
  [/\bhero|banner|top of (the )?(home ?)?page|first screen\b/, "hero"],
  [/\bservices?\b/, "services"],
  [/\bpricing|prices\b/, "pricing"],
  [/\breviews?|testimonials?\b/, "reviews"],
  [/\bfaq|questions?\b/, "faq"],
  [/\bcontact\b/, "contact"],
  [/\babout|intro\b/, "intro"],
  [/\bgallery|photos?\b/, "gallery"],
  [/\bbooking|appointments?\b/, "booking"],
];

const TARGETS: [RegExp, LiteralDirective["kind"] | "subheading" | "body" | "phone" | "email"][] = [
  [/\b(main |primary |big |call to action |cta )?buttons?\b/, "button_label"],
  [/\b(sub-?headline|sub-?heading|sub-?title|supporting (text|line))\b/, "subheading"],
  [/\b(headline|head ?line|main heading|hero title|h1|main title|big text)\b/, "section_text"],
  [/\b(heading|title)\b/, "section_text"],
  [/\b(body text|paragraph|description text)\b/, "body"],
  [/\b(phone( number)?|telephone|mobile number)\b/, "phone"],
  [/\b(e-?mail( address)?)\b/, "email"],
];

const CHANGE_VERB =
  /\b(change|set|make|update|rename|replace|edit|reword|put|say|says|read|reads)\b/;

const VALUE_LEAD =
  /(?:\bto\s+(?:say\s+|read\s+)?|\bsay\s+|\bsays\s+|\breads?\s+|\binto\s+|\bwith\s+|:\s*)/;

const stripWrapping = (value: string) =>
  clean(value)
    .replace(/^["'“”‘’`]+/, "")
    .replace(/["'“”‘’`]+$/, "")
    .replace(/[.,;]+$/, "")
    .trim();

/**
 * Splits a sentence into clauses without breaking quoted wording apart, so
 * "make it say 'fast, friendly and local'" stays one value.
 */
function clauses(instruction: string): string[] {
  const quotes: string[] = [];
  const masked = instruction.replace(/(["'“”‘’])((?:(?!\1)[^])*?)\1/g, (_all, _q, inner) => {
    quotes.push(String(inner));
    return `\u0000${quotes.length - 1}\u0000`;
  });
  return masked
    .split(/\s*(?:,| and | then |;|\.|\n)\s*/i)
    .map((part) =>
      part.replace(/\u0000(\d+)\u0000/g, (_all, index) => `"${quotes[Number(index)] ?? ""}"`),
    )
    .map(clean)
    .filter(Boolean);
}

function sectionHint(text: string): string | undefined {
  for (const [pattern, kind] of SECTION_HINTS) if (pattern.test(text)) return kind;
  return undefined;
}

/** Reads the exact-wording instructions in an owner's sentence. */
export function readLiteralDirectives(instruction: string): LiteralDirective[] {
  const out: LiteralDirective[] = [];
  for (const clause of clauses(instruction)) {
    const lower = clause.toLowerCase();
    let target: string | null = null;
    let targetIndex = Number.MAX_SAFE_INTEGER;
    for (const [pattern, kind] of TARGETS) {
      const match = pattern.exec(lower);
      if (match && match.index < targetIndex) {
        target = kind;
        targetIndex = match.index;
      }
    }
    if (!target) continue;

    const quoted = /(["'“”‘’])((?:(?!\1)[^])*?)\1/.exec(clause);
    let value = quoted ? stripWrapping(quoted[2] ?? "") : "";
    if (!value) {
      if (!CHANGE_VERB.test(lower)) continue;
      const after = clause.slice(targetIndex);
      const lead = VALUE_LEAD.exec(after);
      if (!lead) continue;
      value = stripWrapping(after.slice(lead.index + lead[0].length));
    }
    if (!value || value.length < 2) continue;

    if (target === "phone" || target === "email") {
      const field: BusinessFactField = target;
      const normalised =
        target === "email"
          ? (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(value)?.[0] ?? "")
          : (/\+?[\d][\d\s().-]{6,}\d/.exec(value)?.[0] ?? "");
      if (!normalised) continue;
      out.push({ kind: "fact", field, value: clean(normalised).slice(0, 60) });
      continue;
    }

    const hint = sectionHint(lower);
    if (target === "button_label") {
      out.push({
        kind: "button_label",
        value: value.slice(0, 60),
        ...(hint ? { sectionKind: hint } : {}),
      });
      continue;
    }

    const field = target === "subheading" ? "subheading" : target === "body" ? "body" : "heading";
    out.push({
      kind: "section_text",
      field,
      value: value.slice(0, field === "body" ? 400 : 140),
      ...(hint ? { sectionKind: hint } : {}),
    });
  }
  // De-duplicate identical directives and keep a single request small.
  const seen = new Set<string>();
  return out
    .filter((directive) => {
      const key = JSON.stringify(directive);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
