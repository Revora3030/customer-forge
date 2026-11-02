/**
 * Missed-opportunity help drawer for a customer's public site.
 *
 * After a visitor starts the quote calculator and then goes quiet, a small
 * dismissible drawer offers two things: tap-to-call (ONLY the business's
 * verified phone, from `stickyActions`) and a way back to finish the quote.
 *
 * Rules:
 * - OFF by default. It shows only when the site's stored settings say
 *   `generation.helpDrawer.enabled === true`. Nothing in the product sets that;
 *   turning it on for a customer needs Adam's OK.
 * - The idle timer runs in the visitor's browser only. Nothing is sent,
 *   tracked or stored: no cookie, no localStorage, no network call. A dismissal
 *   lasts for the page view only, so there is nothing for a cookie banner to gate.
 * - It never shows after the quote was submitted, while the tab is hidden, or
 *   when there is no verified action to offer.
 * - No SMS, no automated call.
 */

/** How long the visitor must be idle after starting the quote. */
export const HELP_DRAWER_IDLE_MS = 45_000;

/** Only an explicit `true` enables it; anything else (missing, malformed) is off. */
export function readHelpDrawerEnabled(generation: unknown): boolean {
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) return false;
  const raw = (generation as Record<string, unknown>)["helpDrawer"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)["enabled"] === true;
}

export type HelpDrawerState = {
  /** The visitor touched the quote calculator at least once. */
  started: boolean;
  lastActivityAt: number;
  now: number;
  quoteDone: boolean;
  dismissed: boolean;
  tabHidden: boolean;
  hasActions: boolean;
  idleMs?: number;
};

/** The trigger rule, kept pure so it can be tested without a browser. */
export function shouldOpenHelpDrawer(state: HelpDrawerState): boolean {
  if (!state.started || state.quoteDone || state.dismissed || state.tabHidden || !state.hasActions) return false;
  return state.now - state.lastActivityAt >= (state.idleMs ?? HELP_DRAWER_IDLE_MS);
}

type Action = { label: string; href: string; kind: "call" | "book" | "quote" | "contact" };

/** Call (verified phone) first, then the way back to the quote; nothing else. */
export function helpDrawerActions(actions: readonly Action[]): { label: string; href: string; kind: "call" | "quote" }[] {
  const out: { label: string; href: string; kind: "call" | "quote" }[] = [];
  const call = actions.find((a) => a.kind === "call");
  if (call) out.push({ label: "Call us now", href: call.href, kind: "call" });
  const back = actions.find((a) => a.kind === "quote" || a.kind === "contact" || a.kind === "book");
  if (back) out.push({ label: "Finish my quote", href: back.href, kind: "quote" });
  return out;
}
