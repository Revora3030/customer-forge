/**
 * Campaign / QR tracking and review management data hooks.
 *
 * Everything is tenant-scoped through the caller's organization id and RLS.
 * Campaign performance is read from real `analytics_events` rows rather than a
 * cached counter, so the numbers shown always match tracked traffic.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";

export type Campaign = {
  id: string;
  name: string;
  source: string;
  medium: string | null;
  code: string;
  target_path: string | null;
  scans: number;
  created_at: string;
};

export function useCampaigns(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["campaigns", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const [{ data: campaigns, error }, { data: events }] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, source, medium, code, target_path, scans, created_at")
          .eq("organization_id", organizationId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("analytics_events")
          .select("campaign, event_type")
          .eq("organization_id", organizationId!)
          .not("campaign", "is", null),
      ]);
      if (error) throw error;
      const perf = new Map<string, { views: number; conversions: number }>();
      for (const event of events ?? []) {
        const key = String(event.campaign);
        const row = perf.get(key) ?? { views: 0, conversions: 0 };
        if (event.event_type === "page_view") row.views += 1;
        else row.conversions += 1;
        perf.set(key, row);
      }
      return (campaigns ?? []).map((campaign) => ({
        ...campaign,
        views: perf.get(campaign.code)?.views ?? 0,
        conversions: perf.get(campaign.code)?.conversions ?? 0,
      }));
    },
  });
}

export function useCampaignLeads(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-leads", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, campaign, source, status, estimated_value")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveCampaign(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      source: string;
      medium: string | null;
      code: string;
      target_path: string | null;
    }) => {
      const payload = { ...input, organization_id: organizationId! };
      const { error } = input.id
        ? await supabase
            .from("campaigns")
            .update(payload as never)
            .eq("id", input.id)
        : await supabase.from("campaigns").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign saved.");
      void queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that campaign.")),
  });
}

export function useDeleteCampaign(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign removed.");
      void queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't remove that campaign.")),
  });
}

export function useSetReviewPublished(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase
        .from("reviews")
        .update({ is_published: published } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that review.")),
  });
}

/**
 * Queues a review request for a completed customer. The message is stored as an
 * automation run so it flows through the same delivery pipeline (and the same
 * honest "queued vs sent" states) as every other follow-up.
 */
export function useRequestReview(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      recipient: string;
      channel: "email" | "sms";
      businessName: string;
      reviewLink: string | null;
      leadId?: string | null;
    }) => {
      const link = input.reviewLink?.trim();
      const body = `Hi ${input.name.split(" ")[0] ?? "there"} — thanks again for choosing ${input.businessName}. Would you leave us a quick review?${link ? ` ${link}` : ""}`;
      const { error } = await supabase.from("automation_runs").insert({
        organization_id: organizationId!,
        lead_id: input.leadId ?? null,
        trigger_event: "review_request",
        action_type: input.channel,
        recipient: input.recipient,
        subject: `How did we do, ${input.name.split(" ")[0] ?? "there"}?`,
        body,
        scheduled_for: new Date().toISOString(),
        status: "queued",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review request queued.");
      void queryClient.invalidateQueries({ queryKey: ["automation_runs", organizationId] });
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't queue that review request.")),
  });
}
