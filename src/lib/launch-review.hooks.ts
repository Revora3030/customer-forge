import { useQuery } from "@tanstack/react-query";
import { getLaunchReview } from "@/lib/builder/launch-review.functions";
import type { LaunchReview } from "@/lib/builder/launch-review";

/**
 * The launch-quality review for this workspace, recomputed server-side from
 * live content plus stored real-browser evidence.
 */
export function useLaunchReview(organizationId: string | undefined) {
  return useQuery<LaunchReview>({
    queryKey: ["launch-review", organizationId],
    enabled: !!organizationId,
    staleTime: 15_000,
    queryFn: () => getLaunchReview({ data: { organizationId: organizationId! } }),
  });
}
