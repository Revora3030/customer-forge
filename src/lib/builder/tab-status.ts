/**
 * LOV-15: build status in the browser tab while the builder is in the
 * background. Pure helpers; the hook lives in builder-chat/use-tab-status.ts.
 * It reads state the chat already has, so it adds no polling and no server load.
 */

export type TabStatus = "building" | "ready" | "review" | "failed" | null;

/** Tab labels. Kept short: tabs truncate. */
export const TAB_LABELS: Record<Exclude<TabStatus, null>, string> = {
  building: "Building…",
  ready: "Site ready",
  review: "Plan ready to review",
  failed: "Needs attention",
};

const PREFIX = /^(?:[●✓!?] )?(?:Building…|Site ready|Plan ready to review|Needs attention) · /;

/** Removes a status prefix we added earlier, so it never stacks. */
export function baseTitle(title: string): string {
  return title.replace(PREFIX, "");
}

/** The tab title for a status, or the plain base title when there is none. */
export function tabTitle(title: string, status: TabStatus): string {
  const base = baseTitle(title);
  if (!status) return base;
  const mark = status === "building" ? "●" : status === "ready" ? "✓" : status === "review" ? "?" : "!";
  return `${mark} ${TAB_LABELS[status]} · ${base}`;
}

/** What a finished request means for the tab. Anything else shows nothing. */
export function outcomeStatus(state: string | null | undefined): TabStatus {
  if (state === "complete") return "ready";
  if (state === "waiting_for_approval") return "review";
  if (state === "failed") return "failed";
  return null;
}

/**
 * Next tab status. Only while the tab is hidden: building while work runs, the
 * outcome once it ends, and cleared as soon as the owner looks at the tab.
 */
export function nextTabStatus(input: {
  hidden: boolean;
  working: boolean;
  wasWorking: boolean;
  lastState: string | null | undefined;
  current: TabStatus;
}): TabStatus {
  if (!input.hidden) return null;
  if (input.working) return "building";
  if (input.wasWorking) return outcomeStatus(input.lastState);
  // Still hidden and idle: keep the outcome the owner hasn't seen yet.
  return input.current === "building" ? null : input.current;
}

/** Dot colour drawn on the favicon for each status. */
export const BADGE_COLOURS: Record<Exclude<TabStatus, null>, string> = {
  building: "#6366f1",
  ready: "#10b981",
  review: "#f59e0b",
  failed: "#ef4444",
};
