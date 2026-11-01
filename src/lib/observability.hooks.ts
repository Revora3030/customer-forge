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

/**
 * True when the server could not resolve this page's server-function ID
 * ("Invalid server function ID"): the tab is running a build the server no
 * longer matches. Retrying or polling the same ID can never succeed.
 */
export function isStaleServerFnError(error: unknown): boolean {
  return error != null && isStaleDeployError(describeClientError(error).message);
}

/** Poll every 30s, but stop once the tab is known to be on a stale build. */
export function activityFeedRefetchInterval(error: unknown): number | false {
  return isStaleServerFnError(error) ? false : POLL_MS;
}

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
    refetchInterval: (query) => activityFeedRefetchInterval(query.state.error),
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
