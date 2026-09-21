/**
 * Runs Revora's safe repairs from the builder and refreshes the builder data so
 * the owner sees the real, post-repair state instead of a stale screen.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { runSelfHeal, type SelfHealResult } from "@/lib/self-heal.functions";
import { friendlyError } from "@/lib/user-error";

export function useSelfHeal(organizationId: string | undefined) {
  const heal = useServerFn(runSelfHeal);
  const queryClient = useQueryClient();

  return useMutation<SelfHealResult>({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No workspace selected.");
      return heal({ data: { organizationId } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      if (result.rolledBack) toast.error(result.summary);
      else if (result.fixed.length) toast.success(result.summary);
      else toast.info(result.summary);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
}
