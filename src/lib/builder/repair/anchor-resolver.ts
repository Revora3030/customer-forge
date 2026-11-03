/**
 * REVORA BUILDER — FUZZY ANCHOR RESOLUTION (the repair apply layer).
 *
 * A repair turn answers with search/replace edits. The SEARCH text the model
 * quotes is often not byte-identical to what is stored (spacing collapsed, a
 * curly quote straightened, a word dropped). This is Aider's EditBlockCoder
 * cascade ported to TypeScript, in decreasing precision:
 *
 *   1. exact            — the search text occurs exactly once;
 *   2. normalized       — the same after collapsing whitespace and quote style;
 *   3. sequence         — token-level similarity of a same-sized window, at or
 *                         above `minConfidence` (0.8), with a clear lead over
 *                         the best non-overlapping runner-up;
 *   4. block            — first 3 + last 3 lines match when the middle drifted.
 *
 * Two non-negotiable rules:
 *   - `ambiguous` is a distinct failure from `none` (the repair instruction is
 *     different: expand the context vs. re-read the target).
 *   - A guess is never applied. Below the bar the edit fails honestly.
 *
 * Composition trees have no node ids, so on the AST the anchor is the JSON
 * pointer path plus the text the model believes is there (`resolveNodeAnchor`):
 * the exact path is trusted only when its text still agrees, otherwise the
 * one node whose text matches at or above the bar is used.
 *
 * Pure: no network, no database, no model.
 */

export type MatchType = "exact" | "normalized" | "sequence" | "block" | "none" | "ambiguous";

export interface Resolved {
  matchType: MatchType;
  /** 0..1 */
  confidence: number;
  /** Char offset in the ORIGINAL snapshot (-1 when unresolved). */
  start: number;
  end: number;
  matchedText: string;
}

export const ANCHOR_MIN_CONFIDENCE = 0.8;
export const ANCHOR_AMBIGUITY_RATIO = 0.85;

const UNRESOLVED = (matchType: "none" | "ambiguous", confidence = 0): Resolved => ({
  matchType,
  confidence,
  start: -1,
  end: -1,
  matchedText: "",
});

export function allIndexesOf(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return out;
    out.push(at);
    from = at + 1;
  }
}

const QUOTES: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u00A0": " ",
};

/**
 * Collapses whitespace runs to one space, trims line ends, folds typographic
 * quotes/dashes, and keeps a map from every normalized char back to the
 * original offset so a hit can be mapped back to the stored text.
 */
export function normalizeWs(text: string): { text: string; toOriginalRange: (start: number, length: number) => [number, number] } {
  let out = "";
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i += 1) {
    const raw = text[i]!;
    const ch = QUOTES[raw] ?? raw;
    if (/\s/.test(ch)) {
      if (pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0 && out.length) {
      out += " ";
      map.push(pendingSpace);
    }
    pendingSpace = -1;
    out += ch;
    map.push(i);
  }
  return {
    text: out,
    toOriginalRange: (start, length) => {
      const s = map[start] ?? 0;
      const lastIdx = map[start + length - 1] ?? s;
      return [s, lastIdx + 1];
    },
  };
}

export function tokenize(text: string): string[] {
  return normalizeWs(text).text.toLowerCase().match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** difflib-style ratio over tokens: 2·LCS / (|a| + |b|). */
export function ratio(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const cap = 1500;
  const x = a.slice(0, cap);
  const y = b.slice(0, cap);
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  return (2 * prev[y.length]!) / (x.length + y.length);
}

type Unit = { text: string; start: number; end: number };

/** Lines for multi-line text; words (with their offsets) for one-line text. */
function unitsOf(text: string, multiLine: boolean): Unit[] {
  const units: Unit[] = [];
  if (multiLine) {
    let start = 0;
    for (const line of text.split("\n")) {
      units.push({ text: line, start, end: start + line.length });
      start += line.length + 1;
    }
    return units;
  }
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) units.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  return units;
}

function sequenceWindows(snapshot: string, search: string) {
  const multiLine = search.includes("\n") || snapshot.includes("\n");
  const units = unitsOf(snapshot, multiLine);
  const want = unitsOf(search, multiLine).length || 1;
  const searchTokens = tokenize(search);
  const windows: { score: number; first: number; last: number }[] = [];
  const size = Math.min(want, units.length);
  for (let i = 0; i + size <= units.length; i += 1) {
    const text = units.slice(i, i + size).map((u) => u.text).join(multiLine ? "\n" : " ");
    windows.push({ score: ratio(searchTokens, tokenize(text)), first: i, last: i + size - 1 });
  }
  return { units, windows };
}

export function resolveAnchor(
  snapshot: string,
  search: string,
  opts: { minConfidence?: number; ambiguityRatio?: number } = {},
): Resolved {
  const minConfidence = opts.minConfidence ?? ANCHOR_MIN_CONFIDENCE;
  const ambiguityRatio = opts.ambiguityRatio ?? ANCHOR_AMBIGUITY_RATIO;
  if (!search) return UNRESOLVED("none");

  // 1. EXACT
  const exact = allIndexesOf(snapshot, search);
  if (exact.length === 1)
    return { matchType: "exact", confidence: 1, start: exact[0]!, end: exact[0]! + search.length, matchedText: search };
  if (exact.length > 1) return UNRESOLVED("ambiguous", 1);

  // 2. NORMALIZED WHITESPACE / QUOTES
  const normSnapshot = normalizeWs(snapshot);
  const normSearch = normalizeWs(search).text;
  if (normSearch) {
    const hits = allIndexesOf(normSnapshot.text, normSearch);
    if (hits.length === 1) {
      const [s, e] = normSnapshot.toOriginalRange(hits[0]!, normSearch.length);
      return { matchType: "normalized", confidence: 0.97, start: s, end: e, matchedText: snapshot.slice(s, e) };
    }
    if (hits.length > 1) return UNRESOLVED("ambiguous", 0.97);
  }

  // 3. SEQUENCE SIMILARITY (sliding window, same size as the search)
  const { units, windows } = sequenceWindows(snapshot, search);
  const best = windows.reduce<(typeof windows)[number] | null>((top, w) => (!top || w.score > top.score ? w : top), null);
  if (best && best.score >= minConfidence) {
    const second = windows
      .filter((w) => w.last < best.first || w.first > best.last)
      .reduce((top, w) => Math.max(top, w.score), 0);
    if (second > best.score * ambiguityRatio) return UNRESOLVED("ambiguous", best.score);
    const start = units[best.first]!.start;
    const end = units[best.last]!.end;
    return { matchType: "sequence", confidence: best.score, start, end, matchedText: snapshot.slice(start, end) };
  }

  // 4. BLOCK ANCHOR (first 3 + last 3 lines) when the middle drifted
  const searchLines = search.split("\n");
  if (searchLines.length >= 6) {
    const head = searchLines.slice(0, 3).join("\n");
    const tail = searchLines.slice(-3).join("\n");
    const headHits = allIndexesOf(snapshot, head);
    if (headHits.length === 1) {
      const tailIdx = snapshot.indexOf(tail, headHits[0]! + head.length);
      if (tailIdx > -1 && snapshot.indexOf(tail, tailIdx + 1) < 0) {
        const start = headHits[0]!;
        const end = tailIdx + tail.length;
        return { matchType: "block", confidence: 0.88, start, end, matchedText: snapshot.slice(start, end) };
      }
    }
    if (headHits.length > 1) return UNRESOLVED("ambiguous", 0.88);
  }

  return UNRESOLVED("none", best?.score ?? 0);
}

export type Edit = { id: string; search: string; replace: string };
export type EditFailure = { editId: string; matchType: MatchType; confidence: number; hint: string };
export type ApplyResult = { text: string; applied: number; failed: EditFailure[] };

export const AMBIGUOUS_HINT = "Multiple equally-good matches. Expand the SEARCH text with more of the unique surrounding words.";
export const NONE_HINT = "No match at or above 0.80 confidence. The text may have changed; re-read the target before retrying.";
export const OVERLAP_HINT = "This edit overlaps another edit in the same batch. Merge them into one edit.";

/**
 * Order-invariant batch apply: every edit is resolved against the ORIGINAL
 * snapshot, overlapping edits are refused (never half-applied), and the rest
 * are applied back-to-front so earlier offsets stay valid.
 */
export function applyBatch(snapshot: string, edits: Edit[], opts: { minConfidence?: number } = {}): ApplyResult {
  const resolved = edits.map((edit) => ({ edit, r: resolveAnchor(snapshot, edit.search, opts) }));
  const failed: EditFailure[] = [];
  const ok: typeof resolved = [];
  for (const entry of resolved) {
    if (entry.r.matchType === "none" || entry.r.matchType === "ambiguous")
      failed.push({
        editId: entry.edit.id,
        matchType: entry.r.matchType,
        confidence: entry.r.confidence,
        hint: entry.r.matchType === "ambiguous" ? AMBIGUOUS_HINT : NONE_HINT,
      });
    else ok.push(entry);
  }
  ok.sort((a, b) => a.r.start - b.r.start);
  const kept: typeof ok = [];
  for (const entry of ok) {
    const previous = kept[kept.length - 1];
    if (previous && entry.r.start < previous.r.end) {
      failed.push({ editId: entry.edit.id, matchType: "ambiguous", confidence: entry.r.confidence, hint: OVERLAP_HINT });
      continue;
    }
    kept.push(entry);
  }
  let text = snapshot;
  for (const { edit, r } of [...kept].sort((a, b) => b.r.start - a.r.start)) {
    text = text.slice(0, r.start) + edit.replace + text.slice(r.end);
  }
  return { text, applied: kept.length, failed };
}

/* ------------------------------- JSON / AST -------------------------------- */

const unescapePointer = (token: string) => token.replace(/~1/g, "/").replace(/~0/g, "~");
const escapePointer = (token: string) => token.replace(/~/g, "~0").replace(/\//g, "~1");

export function pointerTokens(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer.slice(1).split("/").map(unescapePointer);
}

export function joinPointer(tokens: (string | number)[]): string {
  return tokens.length ? `/${tokens.map((t) => escapePointer(String(t))).join("/")}` : "";
}

export function getAtPointer(root: unknown, pointer: string): { found: boolean; value: unknown } {
  const tokens = pointerTokens(pointer);
  if (!tokens) return { found: false, value: undefined };
  let node: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(node)) {
      if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= node.length) return { found: false, value: undefined };
      node = node[Number(token)];
    } else if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, token)) {
      node = (node as Record<string, unknown>)[token];
    } else return { found: false, value: undefined };
  }
  return { found: true, value: node };
}

/**
 * Returns a copy of `root` with the value at `pointer` replaced (pure
 * assignment, never a merge). The pointer must already exist.
 */
export function setAtPointer<T>(root: T, pointer: string, value: unknown): { ok: boolean; root: T } {
  const tokens = pointerTokens(pointer);
  if (!tokens || !getAtPointer(root, pointer).found) return { ok: false, root };
  if (!tokens.length) return { ok: true, root: value as T };
  const copy = structuredClone(root) as unknown;
  let node = copy as Record<string, unknown> | unknown[];
  for (let i = 0; i < tokens.length - 1; i += 1) node = (node as Record<string, unknown>)[tokens[i]!] as Record<string, unknown>;
  const last = tokens[tokens.length - 1]!;
  if (Array.isArray(node)) node[Number(last)] = value;
  else node[last] = value;
  return { ok: true, root: copy as T };
}

/** Every string leaf under `root`, with its JSON pointer. */
export function stringLeaves(root: unknown, base: (string | number)[] = [], out: { pointer: string; key: string; value: string }[] = []) {
  if (typeof root === "string") {
    out.push({ pointer: joinPointer(base), key: String(base[base.length - 1] ?? ""), value: root });
  } else if (Array.isArray(root)) {
    root.forEach((item, index) => stringLeaves(item, [...base, index], out));
  } else if (root && typeof root === "object") {
    for (const [key, item] of Object.entries(root)) stringLeaves(item, [...base, key], out);
  }
  return out;
}

export type NodeAnchor = { path: string; matchType: MatchType; confidence: number };

/**
 * Resolves an AST anchor: a JSON pointer plus the text the editor believes is
 * at (or under) it. The pointer is trusted when its text still agrees with the
 * expected text; otherwise the one string leaf inside `scope` whose text best
 * matches at or above the bar is used, and a near-tie is ambiguous.
 */
export function resolveNodeAnchor(
  root: unknown,
  anchor: { path: string; expectText?: string | null; scope?: string },
  opts: { minConfidence?: number; ambiguityRatio?: number } = {},
): NodeAnchor {
  const minConfidence = opts.minConfidence ?? ANCHOR_MIN_CONFIDENCE;
  const ambiguityRatio = opts.ambiguityRatio ?? ANCHOR_AMBIGUITY_RATIO;
  const at = getAtPointer(root, anchor.path);
  const expect = anchor.expectText?.trim() ? anchor.expectText : null;
  if (at.found) {
    if (!expect) return { path: anchor.path, matchType: "exact", confidence: 1 };
    const text = typeof at.value === "string" ? at.value : JSON.stringify(at.value);
    if (text.includes(expect) || normalizeWs(text).text.includes(normalizeWs(expect).text))
      return { path: anchor.path, matchType: "exact", confidence: 1 };
  }
  if (!expect) return { path: "", matchType: "none", confidence: 0 };
  const scope = anchor.scope ?? "";
  const scoped = getAtPointer(root, scope);
  if (!scoped.found) return { path: "", matchType: "none", confidence: 0 };
  const want = tokenize(expect);
  const scored = stringLeaves(scoped.value, pointerTokens(scope) ?? [])
    .map((leaf) => ({ leaf, score: leaf.value.includes(expect) ? 1 : ratio(want, tokenize(leaf.value)) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < minConfidence) return { path: "", matchType: "none", confidence: best?.score ?? 0 };
  const second = scored[1]?.score ?? 0;
  if (second > best.score * ambiguityRatio) return { path: "", matchType: "ambiguous", confidence: best.score };
  return { path: best.leaf.pointer, matchType: best.score === 1 ? "exact" : "sequence", confidence: best.score };
}
