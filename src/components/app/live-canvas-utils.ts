/** Pure helpers for the live canvas skeleton (kept out of the component file for fast refresh). */
/** How often the empty canvas re-checks for freshly written pages. */
export const SKELETON_CONTENT_POLL_MS = 4_000;

/** The single status line shown over the canvas, from real recorded progress only. */
export function canvasStatusLine(input: {
  status: string | null;
  stalled: boolean;
  latestStage: string | null;
  latestDetail: string | null;
}): string {
  if (input.stalled) return "Reconnecting to your build…";
  if (input.status === "failed") return "The build hit a problem — it retries automatically.";
  if (input.status === "queued") return "Your build is queued — the AI team starts in a few seconds…";
  if (input.status === "processing") {
    if (input.latestStage) {
      const stage = input.latestStage.trim().replace(/[.…]+$/, "");
      const detail = input.latestDetail?.trim();
      return detail && !/^Build progress:/i.test(detail) ? `${stage} — ${detail}` : `${stage}…`;
    }
    return "Revora's AI team is starting your website…";
  }
  return "Describe your business in the chat — your website takes shape here.";
}
