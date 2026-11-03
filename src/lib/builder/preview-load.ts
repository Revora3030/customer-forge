/** Load state for a builder preview frame. A frame that never loads must not stay blank. */
export type PreviewLoadState = "loading" | "loaded" | "failed";
export type PreviewLoadEvent = "load" | "painted" | "error" | "timeout";

export const PREVIEW_LOAD_TIMEOUT_MS = 20_000;

export function nextPreviewLoadState(state: PreviewLoadState, event: PreviewLoadEvent): PreviewLoadState {
  if (event === "load" || event === "painted") return "loaded";
  if (event === "error") return "failed";
  // A late timeout must never hide a frame that already loaded.
  return state === "loading" ? "failed" : state;
}

/** How often the builder checks whether its frame has drawn the page. */
export const PREVIEW_PAINT_POLL_MS = 80;

type DocLike = { URL?: string; readyState?: string; querySelector?: (selector: string) => unknown } | null | undefined;

/**
 * True once the frame's document holds the site page itself. A
 * server-rendered `/p` page has it in its first HTML bytes, long before the
 * frame's load event (which also waits for every picture); the browser-only
 * `/draft` page only once its data has arrived. Until then the builder keeps
 * its page skeleton over the frame.
 */
export function framePainted(doc: DocLike): boolean {
  if (!doc || !doc.querySelector) return false;
  if (!doc.URL || doc.URL === "about:blank") return false;
  try {
    return Boolean(doc.querySelector("main"));
  } catch {
    return false;
  }
}
