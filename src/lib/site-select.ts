/**
 * Keyboard model for the customer-site custom select (SiteSelect), following
 * the WAI-ARIA "select-only combobox" pattern. Pure so it can be tested.
 */
export type SelectKeyResult =
  | { kind: "open"; active: number }
  | { kind: "move"; active: number }
  | { kind: "choose"; active: number; close: boolean }
  | { kind: "close" }
  | { kind: "none" };

const clamp = (n: number, count: number) => Math.min(count - 1, Math.max(0, n));

/** What a key does, given whether the list is open, the active option and how many there are. */
export function selectKeyAction(key: string, open: boolean, active: number, count: number, altKey = false): SelectKeyResult {
  if (count <= 0) return { kind: "none" };
  if (!open) {
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") return { kind: "open", active: clamp(active, count) };
    if (key === "Home") return { kind: "open", active: 0 };
    if (key === "End") return { kind: "open", active: count - 1 };
    return { kind: "none" };
  }
  if (key === "ArrowDown") return { kind: "move", active: clamp(active + 1, count) };
  if (key === "ArrowUp" && altKey) return { kind: "choose", active: clamp(active, count), close: true };
  if (key === "ArrowUp") return { kind: "move", active: clamp(active - 1, count) };
  if (key === "Home") return { kind: "move", active: 0 };
  if (key === "End") return { kind: "move", active: count - 1 };
  if (key === "PageDown") return { kind: "move", active: clamp(active + 10, count) };
  if (key === "PageUp") return { kind: "move", active: clamp(active - 10, count) };
  if (key === "Enter" || key === " ") return { kind: "choose", active: clamp(active, count), close: true };
  if (key === "Tab") return { kind: "choose", active: clamp(active, count), close: true };
  if (key === "Escape") return { kind: "close" };
  return { kind: "none" };
}

/**
 * Type-to-select: the next option (after `from`, wrapping) whose label starts
 * with `query`; a repeated single letter cycles through matches. -1 if none.
 */
export function typeaheadIndex(labels: readonly string[], query: string, from: number): number {
  const q = query.trim().toLowerCase();
  if (!q || !labels.length) return -1;
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? q[0]! : q;
  const start = repeated || q.length === 1 ? from + 1 : from;
  for (let i = 0; i < labels.length; i++) {
    const index = (((start + i) % labels.length) + labels.length) % labels.length;
    if (labels[index]!.trim().toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}
