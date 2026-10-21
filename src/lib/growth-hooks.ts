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
import { requestReviewForAppointment } from "@/lib/automation-queue.functions";

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
 * Queues a review request for a completed booking. The server builds the
 * message from the booking's own contact details and the business profile and
 * sends it through the same automation pipeline (and the same honest "queued
 * vs sent" states) as every other follow-up; the browser never writes the run.
 */
export function useRequestReview(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { appointmentId: string; channel: "email" | "sms" }) => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      return requestReviewForAppointment({
        data: { organizationId, appointmentId: input.appointmentId, channel: input.channel },
      });
    },
    onSuccess: () => {
      toast.success("Review request queued.");
      void queryClient.invalidateQueries({ queryKey: ["automation_runs", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["review_requests", organizationId] });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["review_requests", organizationId] });
      toast.error(friendlyError(error, "Couldn't queue that review request."));
    },
  });
}

/**
 * Bookings that already have a review request queued or sent, read from the
 * saved automation runs (not page memory), so the button stays "asked" after
 * a reload and across devices.
 */
export function useReviewRequestedAppointments(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["review_requests", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_runs")
        .select("appointment_id")
        .eq("organization_id", organizationId!)
        .eq("trigger_event", "review_request")
        .in("status", ["queued", "sent"])
        .not("appointment_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.appointment_id).filter((id): id is string => Boolean(id)));
    },
  });
}
