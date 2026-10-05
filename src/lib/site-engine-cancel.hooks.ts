import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { cancelSiteGeneration } from "@/lib/site-engine-cancel.functions";

/** Cancels the running build (manager+). The worker stops at the next stage. */
export function useCancelSiteEngine(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const cancel = useServerFn(cancelSiteGeneration);
  return useMutation({
    mutationFn: async (jobId: string) => cancel({ data: { organizationId: organizationId!, jobId } }),
    onSuccess: (result) => {
      if (result.cancelled) toast.message("Build cancelled", { description: "Nothing was published. You can build again any time." });
      else toast.message(result.reason ?? "That build has already finished.");
      void queryClient.invalidateQueries({ queryKey: ["generation_job", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't cancel the build. Try again in a moment.")),
  });
}
