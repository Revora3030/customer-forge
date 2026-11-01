/**
 * Deterministic wordmark for a generated site that has no uploaded logo.
 *
 * Everything here is pure: the same business name (and trade) always yields
 * the same monogram, shape and line layout. The renderer builds SVG from these
 * values with React elements, so the name is never concatenated into markup.
 */
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

const STOP_WORDS = new Set(["the", "and", "of", "a", "an", "at", "in", "for", "to"]);
/** Legal endings are not part of how people say the name. */
const LEGAL_SUFFIX = /\s*[,.]?\s+(llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|llp|pllc|pc)$/i;

/** Collapses whitespace, removes control characters and a trailing legal suffix. */
export function cleanBusinessName(name: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  let out = String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i += 1) out = out.replace(LEGAL_SUFFIX, "").trim();
  return out;
}

const wordsOf = (name: string): string[] => name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** One or two upper-case characters for the monogram. Never empty. */
export function wordmarkInitials(name: string | null | undefined): string {
  const words = wordsOf(cleanBusinessName(name));
  const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const pool = significant.length ? significant : words;
  if (pool.length === 0) return "•";
  const first = Array.from(pool[0]!)[0]!;
  const second = pool.length > 1 ? Array.from(pool[1]!)[0]! : "";
  return (first + second).toLocaleUpperCase("en-US");
}

/** FNV-1a, so the choice of shape is stable across runs and machines. */
export function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (const ch of name.toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mark outlines in a 36 x 36 box. */
export const WORDMARK_SHAPES = {
  circle: "M1 18a17 17 0 1 0 34 0a17 17 0 1 0 -34 0Z",
  rounded: "M10 1H26A9 9 0 0 1 35 10V26A9 9 0 0 1 26 35H10A9 9 0 0 1 1 26V10A9 9 0 0 1 10 1Z",
  hex: "M18 1L32.7 9.5V26.5L18 35L3.3 26.5V9.5Z",
  shield: "M18 1L33 6V18C33 27 26 32.5 18 35C10 32.5 3 27 3 18V6Z",
  diamond: "M18 1L35 18L18 35L1 18Z",
  arch: "M3 35V16A15 15 0 0 1 33 16V35Z",
} as const;
export type WordmarkShape = keyof typeof WORDMARK_SHAPES;

const ALL_SHAPES = Object.keys(WORDMARK_SHAPES) as WordmarkShape[];
const TRADE_POOLS: [RegExp, WordmarkShape[]][] = [
  [/hvac|plumb|electric|heating|cooling|air/i, ["hex", "circle", "rounded"]],
  [/roof|construct|landscap|lawn|paint|remodel|contractor|fence/i, ["shield", "arch", "rounded"]],
  [/detail|auto|car|clean|wash|salon|beauty|barber|spa/i, ["circle", "diamond", "rounded"]],
];

/** Same name and trade in, same shape out. */
export function wordmarkShape(name: string | null | undefined, trade?: string | null): WordmarkShape {
  const clean = cleanBusinessName(name);
  const pool = TRADE_POOLS.find(([re]) => re.test(trade ?? ""))?.[1] ?? ALL_SHAPES;
  return pool[hashName(clean) % pool.length]!;
}

const MAX_LINE = 24;
const MAX_TOTAL = 44;

const truncate = (text: string, max: number): string => {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
};

/** One line up to 18 characters; otherwise two balanced lines, each capped. */
export function wordmarkLines(name: string | null | undefined): { lines: string[]; fontSize: number } {
  const clean = truncate(cleanBusinessName(name) || "Business", MAX_TOTAL);
  if (Array.from(clean).length <= 18) return { lines: [clean], fontSize: 18 };
  const words = clean.split(" ");
  if (words.length === 1) return { lines: [truncate(clean, MAX_LINE)], fontSize: 13 };
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const gap = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return {
    lines: [truncate(words.slice(0, best).join(" "), MAX_LINE), truncate(words.slice(best).join(" "), MAX_LINE)],
    fontSize: 14,
  };
}

/** Approximate rendered width in em, per character class (semibold display faces). */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if ("ilj.,'!|: ;".includes(ch)) em += 0.3;
    else if ("ftr()-".includes(ch)) em += 0.42;
    else if ("mwMW".includes(ch)) em += 0.86;
    else if (ch !== ch.toLowerCase() && ch === ch.toUpperCase()) em += 0.68;
    else em += 0.57;
  }
  return Math.ceil(em * fontSize);
}

const norm = (text: string | undefined): string => cleanBusinessName(text).toLowerCase();

/**
 * The AI-authored menu bar usually carries the business name as plain text.
 * When a wordmark takes its place, drop the first such node so the name is not
 * shown twice. Pure: returns a new tree and leaves every other node untouched.
 */
export function withoutBrandText(tree: CompositionTree, name: string): CompositionTree {
  const target = norm(name);
  if (!target) return tree;
  let removed = false;
  const prune = (node: CompositionNode, depth: number): CompositionNode => {
    if (!node.children) return node;
    const kept: CompositionNode[] = [];
    for (const child of node.children) {
      const isBrand =
        !removed &&
        depth <= 3 &&
        (child.type === "text" || child.type === "heading" || child.type === "link") &&
        norm(child.text) === target &&
        !child.children?.length;
      if (isBrand) {
        removed = true;
        continue;
      }
      kept.push(prune(child, depth + 1));
    }
    return { ...node, children: kept };
  };
  const root = prune(tree.root, 0);
  return removed ? { ...tree, root } : tree;
}
