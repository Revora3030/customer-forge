/**
 * Loads the real activity feed for a workspace. Kept short-lived because builds
 * and follow-ups move while the owner is watching.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActivityFeed, type ActivityFeed } from "@/lib/observability.functions";
import {
  describeClientError,
  isStaleDeployError,
  reloadOnceForNewBuild,
} from "@/lib/client-error-classify";

const POLL_MS = 30_000;
/** Longest gap between polls while the feed keeps failing (T039). */
const MAX_POLL_MS = 5 * 60_000;

/**
 * True when the server could not resolve this page's server-function ID
 * ("Invalid server function ID"): the tab is running a build the server no
 * longer matches. Retrying or polling the same ID can never succeed.
 */
export function isStaleServerFnError(error: unknown): boolean {
  return error != null && isStaleDeployError(describeClientError(error).message);
}

/**
 * Poll every 30s, but stop once the tab is known to be on a stale build.
 * T039: after consecutive failed fetches the gap doubles (60s, 120s, ...)
 * up to 5 minutes, and snaps back to 30s after the next success.
 */
export function activityFeedRefetchInterval(
  error: unknown,
  consecutiveFailures = 0,
): number | false {
  if (isStaleServerFnError(error)) return false;
  const failures = Math.max(0, Math.floor(consecutiveFailures));
  if (failures === 0) return POLL_MS;
  return Math.min(POLL_MS * 2 ** Math.min(failures, 10), MAX_POLL_MS);
}

/**
 * T039: never poll from a hidden tab (one open tab per customer at scale was
 * ~2,000 req/min); refetch once when the tab becomes visible again.
 */
export const ACTIVITY_FEED_VISIBILITY_POLICY = {
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

/** Retry an ordinary failure once (T004: a failing feed must not hammer the server); never retry a stale server-function ID. */
export function activityFeedRetry(failureCount: number, error: unknown): boolean {
  return !isStaleServerFnError(error) && failureCount < 1;
}

/**
 * Degraded-state policy (T004): a short stale window, and the last good feed
 * stays on screen while a refetch fails. ActivityFeed labels that state as
 * "unavailable / may be out of date" rather than claiming all is healthy.
 */
export const ACTIVITY_FEED_CACHE_POLICY = {
  staleTime: 10_000,
  placeholderData: keepPreviousData,
} as const;

function recoverStaleBuild() {
  if (typeof window === "undefined") return;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  // Same once-a-minute guard the root error listeners use, so this can never loop.
  reloadOnceForNewBuild(storage, () => window.location.reload());
}

export function useActivityFeed(organizationId: string | undefined) {
  const load = useServerFn(getActivityFeed);
  return useQuery<ActivityFeed>({
    queryKey: ["activity-feed", organizationId],
    enabled: !!organizationId,
    refetchInterval: (query) =>
      activityFeedRefetchInterval(query.state.error, query.state.fetchFailureCount),
    ...ACTIVITY_FEED_VISIBILITY_POLICY,
    retry: activityFeedRetry,
    ...ACTIVITY_FEED_CACHE_POLICY,
    queryFn: async () => {
      try {
        return await load({ data: { organizationId: organizationId! } });
      } catch (error) {
        if (isStaleServerFnError(error)) recoverStaleBuild();
        throw error;
      }
    },
  });
}
