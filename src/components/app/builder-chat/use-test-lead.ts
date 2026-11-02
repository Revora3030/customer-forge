import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { sendTestLead } from "@/lib/test-lead.functions";

/**
 * The "/lead-test" command's default action: the same labelled sample lead the
 * onboarding card sends (it stays out of real lead numbers). A caller can pass
 * its own handler instead, which is how a richer lead simulation plugs in.
 */
export function useSendTestLead(organizationId: string | null) {
  const queryClient = useQueryClient();
  const sendFn = useServerFn(sendTestLead);
  return useMutation({
    mutationFn: () => {
      if (!organizationId) throw new Error("Open a website first.");
      return sendFn({ data: { organizationId } });
    },
    onSuccess: (result) => {
      toast.success(
        result.alertedTo
          ? `Test lead added. An alert was emailed to ${result.alertedTo}.`
          : "Test lead added to your Leads page.",
      );
      void queryClient.invalidateQueries({ queryKey: ["leads", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["journey_facts", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });
}
