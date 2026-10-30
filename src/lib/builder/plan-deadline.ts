/**
 * Bounds on a builder-chat "planning the change…" request, so the chat can
 * never sit on a spinner forever.
 *
 * - After PLAN_SLOW_HINT_MS the live card says it's still working and offers
 *   "Stop waiting" (the plan has not touched the site yet, so stopping is a
 *   real cancel: nothing gets applied).
 * - After PLAN_HARD_TIMEOUT_MS the planner call is treated like a dropped
 *   connection: the chat looks for the plan the server saved under the
 *   request id (bounded by recoverPlan), then fails with Retry.
 */
import { withTimeout } from "@/lib/with-timeout";

export const PLAN_SLOW_HINT_MS = 30_000;
export const PLAN_HARD_TIMEOUT_MS = 5 * 60_000;

export const PLAN_STOPPED_MESSAGE =
  "Stopped waiting. Nothing was changed on your site. Try again to ask afresh.";

/** True once a planning request has run long enough to show the "still working" hint. */
export const planIsSlow = (elapsedMs: number) => elapsedMs >= PLAN_SLOW_HINT_MS;

/**
 * Resolves with `work`, or rejects with a "timed out" error after `ms`. The
 * message matches isDroppedConnection, so the caller's recovery path runs.
 */
export const withDeadline = <T>(work: Promise<T>, ms: number = PLAN_HARD_TIMEOUT_MS): Promise<T> =>
  withTimeout(work, ms, "Planning timed out");
