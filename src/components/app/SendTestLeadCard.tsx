import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/user-error";
import { sendTestLead } from "@/lib/test-lead.functions";

/**
 * Onboarding "Send a test lead": adds one clearly labeled sample lead to the
 * owner's own dashboard (and their own alert inbox, if set up) so they see
 * what a real lead looks like before one arrives.
 */
export function SendTestLeadCard({
  organizationId,
  hasTestLead,
}: {
  organizationId: string | undefined;
  hasTestLead: boolean;
}) {
  const queryClient = useQueryClient();
  const sendFn = useServerFn(sendTestLead);
  const send = useMutation({
    mutationFn: () => sendFn({ data: { organizationId: organizationId! } }),
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

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 p-4">
      <FlaskConical className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">Try it: send yourself a test lead</p>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
          Adds one sample lead, labeled TEST, to your Leads page. If you have set up a lead alert
          inbox, it gets the alert too. No customer is contacted, and test leads are left out of
          your numbers.
        </p>
      </div>
      {hasTestLead ? (
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/leads">See it in Leads</Link>
        </Button>
      ) : null}
      <Button
        variant={hasTestLead ? "outline" : "signal"}
        size="sm"
        disabled={!organizationId || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? "Sending…" : hasTestLead ? "Send another" : "Send a test lead"}
      </Button>
    </div>
  );
}
