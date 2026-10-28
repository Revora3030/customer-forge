/**
 * Does a chat message ask to replace the whole website with a new build?
 *
 * Conservative on purpose: "rebuild the hero" or "redo this section" are edits
 * and must reach the edit planner. Only a request about the whole site (or the
 * exact words "fresh rebuild") counts, and even then the chat only offers the
 * rebuild behind a confirm card; it never starts one on its own.
 */
const WHOLE_SITE = /\b(?:web\s?site|site|everything|all\s+(?:of\s+)?(?:my\s+)?pages|every\s+page|whole\s+thing)\b/;
const REBUILD_VERB = /\b(?:re-?build|re-?make|re-?do|re-?create|start\s+over|start\s+again|start\s+fresh|from\s+scratch)\b/;

export function wantsFreshRebuild(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  // Asking what a rebuild is or does is a question for the planner, not the command.
  if (/^(?:what|how|why|when|where|which|does|is|are|will|would|should)\b/.test(t)) return false;
  if (/^(?:a\s+|do\s+a\s+|do\s+the\s+|run\s+a\s+)?fresh\s+re-?build\b/.test(t)) return true;
  if (/\bfresh\s+re-?build\b/.test(t) && t.length <= 80) return true;
  // A long message that happens to mention rebuilding is a brief or an edit, not the command.
  if (t.length > 400) return false;
  if (!REBUILD_VERB.test(t)) return false;
  // "from scratch" alone is not enough ("write the about copy from scratch"): the whole site must be the object.
  return WHOLE_SITE.test(t);
}

/** "Fresh rebuild" and its polite forms carry no design direction of their own. */
export function isBareRebuildCommand(text: string): boolean {
  return /^(?:a\s+|do\s+a\s+|do\s+the\s+|run\s+a\s+)?fresh\s+re-?build(?:\s+please)?[.!]?$/.test(text.toLowerCase().replace(/\s+/g, " ").trim());
}
