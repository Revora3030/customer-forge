import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { listJarvisApprovalsFn } from "@/lib/jarvis.functions";
import { APPROVALS_QUERY_KEY } from "@/components/app/jarvis/ApprovalsInbox";
import {
  OPEN_APPROVALS_FLAG,
  approvalBeacons,
  type ApprovalBeaconState,
} from "@/lib/city-approval-beacons";

/**
 * Waiting approvals for the city, from the same list the chat inbox (#816)
 * reads and under the same query key, so there is one read, not two. A failed
 * read is "unavailable", never a zero.
 */
export function useApprovalBeacons(): ApprovalBeaconState {
  const query = useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: () => listJarvisApprovalsFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return approvalBeacons(query.isError ? null : query.data?.items);
}

/** Opens the chat approvals inbox: Jarvis reads this flag once and opens the sheet. */
export function useOpenApprovals(): () => void {
  const navigate = useNavigate();
  return () => {
    try {
      sessionStorage.setItem(OPEN_APPROVALS_FLAG, "1");
    } catch {
      /* storage unavailable: Jarvis still opens, the badge is one tap away */
    }
    void navigate({ to: "/admin/jarvis" });
  };
}
