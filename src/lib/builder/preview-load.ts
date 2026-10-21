/** Load state for a builder preview frame. A frame that never loads must not stay blank. */
export type PreviewLoadState = "loading" | "loaded" | "failed";
export type PreviewLoadEvent = "load" | "error" | "timeout";

export const PREVIEW_LOAD_TIMEOUT_MS = 20_000;

export function nextPreviewLoadState(state: PreviewLoadState, event: PreviewLoadEvent): PreviewLoadState {
  if (event === "load") return "loaded";
  if (event === "error") return "failed";
  // A late timeout must never hide a frame that already loaded.
  return state === "loading" ? "failed" : state;
}
