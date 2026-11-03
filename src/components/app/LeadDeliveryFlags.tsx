import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/app/Bits";
import { relative } from "@/lib/format";
import { PROBLEM_COPY, type WatchdogProblem } from "@/lib/lead-delivery-watchdog";

type Flag = { lead_id: string; problem: WatchdogProblem; attempts: number; first_flagged_at: string };

/**
 * Shown only while a lead's "new lead" email has not been accepted by the email
 * provider. The watchdog keeps retrying and the banner disappears on its own
 * once an alert goes out. The lead itself is always safe in Leads.
 */
export function LeadDeliveryFlags({ organizationId }: { organizationId: string | undefined }) {
  const { data } = useQuery({
    queryKey: ["lead-delivery-flags", organizationId],
    enabled: !!organizationId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("lead_delivery_watch" as never)
        .select("lead_id, problem, attempts, first_flagged_at")
        .eq("organization_id", organizationId!)
        .eq("state", "open")
        .order("first_flagged_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (rows ?? []) as unknown as Flag[];
    },
  });
  if (!data?.length) return null;

  const needsYou = data.find((f) => f.problem === "failed_permanent" || f.problem === "no_alert_inbox" || f.problem === "exhausted");
  const lead = needsYou ?? data[0]!;
  return (
    <Panel
      as="div"
      role="alert"
      data-testid="lead-delivery-flags"
      className="flex flex-wrap items-start gap-3 border-destructive/40 bg-destructive/5"
    >
      <BellOff className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium">
          {data.length === 1
            ? "We couldn't email you about 1 new lead"
            : `We couldn't email you about ${data.length} new leads`}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {PROBLEM_COPY[lead.problem]?.owner ?? "We're retrying."} First missed {relative(lead.first_flagged_at)}.
          The lead{data.length === 1 ? " is" : "s are"} saved in Leads either way.
        </p>
      </div>
      <div className="flex gap-3 text-[12px]">
        <Link to="/app/leads" className="text-primary hover:underline">
          Open leads
        </Link>
        <Link to="/app/settings" className="text-primary hover:underline">
          Alert settings
        </Link>
      </div>
    </Panel>
  );
}
