import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nextPublishState } from "@/lib/publish-state";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentStatus, LeadStatus } from "@/lib/domain";
import { generateWebsitePlan, type GoalKey } from "@/lib/website-plan";
import { AUTOMATION_RECIPES, enqueueAutomations } from "@/lib/automation-engine";
import { runDueAutomations } from "@/lib/automations.functions";

/**
 * Client code can only queue automation steps — actual email/SMS delivery runs
 * on the server. This hands the queue to the server pass right away.
 */
async function flushAutomations(organizationId: string) {
  try {
    return await runDueAutomations({ data: { organizationId } });
  } catch (error) {
    // Delivery retries on the next pass, so a dropped request (navigating away,
    // offline tab) is expected and must not surface as an application error.
    const transient =
      error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
    if (!transient) console.warn("automation delivery pass deferred", error);
    return null;
  }
}

const DAY = 86_400_000;

export function useLeads(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["leads", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, name, email, phone, status, source, campaign, city, message, service_interest, estimated_value, next_follow_up_at, last_contacted_at, created_at, service_id, customer_id, assigned_to",
        )
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAppointments(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["appointments", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, name, email, phone, starts_at, ends_at, status, notes, service_id, lead_id")
        .eq("organization_id", organizationId!)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useServices(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["services", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useAnalytics(organizationId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ["analytics", organizationId, days],
    enabled: !!organizationId,
    queryFn: async () => {
      const since = new Date(Date.now() - days * DAY).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_type, source, campaign, device, path, created_at")
        .eq("organization_id", organizationId!)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data;
    },
  });
}

export function useBusinessProfile(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["business_profile", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useWebsiteSettings(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["website_settings", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_settings")
        .select("*")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useReviews(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useNotifications(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["notifications", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
}

export function useCustomers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["customers", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTeam(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["team", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      // Teammate names/emails live in `profiles` (self-read only under RLS), so
      // the roster is resolved by an authenticated server function that checks
      // membership before reading.
      const { listTeamMembers } = await import("@/lib/team.functions");
      return await listTeamMembers({ data: { organizationId: organizationId! } });
    },
  });
}

export function useQuoteRequests(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["quote_requests", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_requests")
        .select(
          "id, answers, estimate_min, estimate_max, created_at, lead_id, leads(name, email, phone)",
        )
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------- mutations --------------------------------- */

function useInvalidate(keys: string[], organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      keys.map((key) => queryClient.invalidateQueries({ queryKey: [key, organizationId] })),
    );
}

export function useUpdateLead(organizationId: string | undefined) {
  const invalidate = useInvalidate(["leads"], organizationId);
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        status?: LeadStatus;
        estimated_value?: number;
        next_follow_up_at?: string | null;
        last_contacted_at?: string | null;
        notes?: string | null;
      };
    }) => {
      const { error } = await supabase
        .from("leads")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that lead.")),
  });
}

export function useCreateLead(organizationId: string | undefined) {
  const invalidate = useInvalidate(["leads"], organizationId);
  return useMutation({
    mutationFn: async (lead: {
      name: string;
      email?: string | undefined;
      phone?: string | undefined;
      source?: string | undefined;
      service_interest?: string | undefined;
      estimated_value?: number | undefined;
      message?: string | undefined;
    }) => {
      const { error } = await supabase
        .from("leads")
        .insert({ ...lead, organization_id: organizationId!, status: "new" } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead added.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't add that lead.")),
  });
}

export function useUpdateAppointment(organizationId: string | undefined) {
  const invalidate = useInvalidate(["appointments"], organizationId);
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment updated.");
      void invalidate();
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't update that appointment.")),
  });
}

export function useSaveService(organizationId: string | undefined) {
  const invalidate = useInvalidate(["services"], organizationId);
  return useMutation({
    mutationFn: async (service: {
      id?: string | undefined;
      name: string;
      description?: string | null | undefined;
      category?: string | null | undefined;
      price?: number | null | undefined;
      starting_price?: number | null | undefined;
      duration_minutes?: number | null | undefined;
      bookable?: boolean | undefined;
      featured?: boolean | undefined;
      is_active?: boolean | undefined;
      sort_order?: number | undefined;
    }) => {
      if (service.id) {
        const { id, ...patch } = service;
        const { error } = await supabase
          .from("services")
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("services")
          .insert({ ...service, organization_id: organizationId! } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Service saved.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that service.")),
  });
}

export function useDeleteService(organizationId: string | undefined) {
  const invalidate = useInvalidate(["services"], organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service removed.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't remove that service.")),
  });
}

export function useSaveBusinessProfile(organizationId: string | undefined) {
  const invalidate = useInvalidate(["business_profile"], organizationId);
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("business_profiles")
        .upsert({ organization_id: organizationId!, ...patch } as never, {
          onConflict: "organization_id",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Business details saved.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save your details.")),
  });
}

export function useSaveWebsiteSettings(organizationId: string | undefined) {
  const invalidate = useInvalidate(["website_settings"], organizationId);
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("website_settings")
        .upsert({ organization_id: organizationId!, ...patch } as never, {
          onConflict: "organization_id",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Website updated.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update your website.")),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("organizations")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that change.")),
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

/* ------------------------------- CRM activity -------------------------------- */

export function useLeadActivities(organizationId: string | undefined, leadId: string | null) {
  return useQuery({
    queryKey: ["lead_activities", organizationId, leadId],
    enabled: !!organizationId && !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("id, kind, body, created_at")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useLogActivity(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      kind,
      body,
    }: {
      leadId: string;
      kind: string;
      body?: string | null;
    }) => {
      const { error } = await supabase.from("lead_activities").insert({
        organization_id: organizationId!,
        lead_id: leadId,
        kind,
        body: body ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lead_activities"] });
    },
  });
}

/** One place for every pipeline action: status, notes, contact logging and automations. */
export function useLeadAction(organizationId: string | undefined, businessName?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lead,
      patch,
      activity,
      trigger,
    }: {
      lead: {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        service_interest?: string | null;
        estimated_value?: number | null;
      };
      patch?: Record<string, unknown>;
      activity?: { kind: string; body?: string | null };
      trigger?: string;
    }) => {
      if (patch && Object.keys(patch).length) {
        const { error } = await supabase
          .from("leads")
          .update(patch as never)
          .eq("id", lead.id);
        if (error) throw error;
      }
      if (activity) {
        await supabase.from("lead_activities").insert({
          organization_id: organizationId!,
          lead_id: lead.id,
          kind: activity.kind,
          body: activity.body ?? null,
        } as never);
      }
      if (trigger) {
        await enqueueAutomations(supabase, {
          organizationId: organizationId!,
          trigger,
          businessName: businessName ?? null,
          lead,
        });
        await flushAutomations(organizationId!);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["lead_activities"] });
      void queryClient.invalidateQueries({ queryKey: ["automation_runs", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that.")),
  });
}

export function useConvertLeadToCustomer(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lead: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      estimated_value?: number | null;
      customer_id?: string | null;
    }) => {
      let customerId = lead.customer_id ?? null;
      if (!customerId) {
        const { data, error } = await supabase
          .from("customers")
          .insert({
            organization_id: organizationId!,
            name: lead.name,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            total_value: Number(lead.estimated_value ?? 0),
            tags: ["New"],
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        customerId = data.id;
      }
      const { error: linkError } = await supabase
        .from("leads")
        .update({ customer_id: customerId, status: "completed" } as never)
        .eq("id", lead.id);
      if (linkError) throw linkError;
      await supabase.from("lead_activities").insert({
        organization_id: organizationId!,
        lead_id: lead.id,
        kind: "converted",
        body: `${lead.name} became a customer.`,
      } as never);
      return customerId;
    },
    onSuccess: () => {
      toast.success("Lead converted to a customer.");
      void queryClient.invalidateQueries({ queryKey: ["leads", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["customers", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["lead_activities"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't convert that lead.")),
  });
}

/* -------------------------------- bookings ---------------------------------- */

export function useCreateAppointment(
  organizationId: string | undefined,
  businessName?: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      email?: string | null;
      phone?: string | null;
      startsAt: string;
      durationMinutes: number;
      serviceId?: string | null;
      notes?: string | null;
      leadId?: string | null;
      status?: AppointmentStatus;
      estimatedValue?: number;
    }) => {
      const starts = new Date(input.startsAt);
      if (Number.isNaN(starts.getTime())) throw new Error("Pick a valid date and time.");
      const ends = new Date(starts.getTime() + input.durationMinutes * 60_000);

      let leadId = input.leadId ?? null;
      if (!leadId) {
        const { data: created, error: leadError } = await supabase
          .from("leads")
          .insert({
            organization_id: organizationId!,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            service_id: input.serviceId ?? null,
            source: "manual",
            status: "booked",
            estimated_value: input.estimatedValue ?? 0,
          } as never)
          .select("id")
          .single();
        if (leadError) throw leadError;
        leadId = created.id;
      } else {
        await supabase
          .from("leads")
          .update({ status: "booked" } as never)
          .eq("id", leadId);
      }

      const { data: appt, error } = await supabase
        .from("appointments")
        .insert({
          organization_id: organizationId!,
          lead_id: leadId,
          service_id: input.serviceId ?? null,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: input.status ?? "confirmed",
          notes: input.notes ?? null,
        } as never)
        .select("id, name, email, phone, starts_at")
        .single();
      if (error) throw error;

      await supabase.from("lead_activities").insert({
        organization_id: organizationId!,
        lead_id: leadId,
        appointment_id: appt.id,
        kind: "booked",
        body: `Appointment set for ${starts.toLocaleString()}.`,
      } as never);

      await enqueueAutomations(supabase, {
        organizationId: organizationId!,
        trigger: "booking_created",
        businessName: businessName ?? null,
        lead: {
          id: leadId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
        appointment: appt,
      });
      await flushAutomations(organizationId!);

      return appt.id;
    },
    onSuccess: () => {
      toast.success("Booking added to the calendar.");
      for (const key of ["appointments", "leads", "automation_runs", "notifications"]) {
        void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
      }
      void queryClient.invalidateQueries({ queryKey: ["lead_activities"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't create that booking.")),
  });
}

export function useSaveAppointment(
  organizationId: string | undefined,
  businessName?: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointment,
      patch,
    }: {
      appointment: {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        starts_at: string;
        lead_id?: string | null;
      };
      patch: {
        status?: AppointmentStatus;
        starts_at?: string;
        ends_at?: string;
        notes?: string | null;
      };
    }) => {
      const { error } = await supabase
        .from("appointments")
        .update(patch as never)
        .eq("id", appointment.id);
      if (error) throw error;

      if (appointment.lead_id) {
        const leadStatus: Partial<Record<AppointmentStatus, LeadStatus>> = {
          confirmed: "booked",
          completed: "completed",
        };
        const nextLeadStatus = patch.status ? leadStatus[patch.status] : undefined;
        if (nextLeadStatus) {
          await supabase
            .from("leads")
            .update({ status: nextLeadStatus } as never)
            .eq("id", appointment.lead_id);
        }
        await supabase.from("lead_activities").insert({
          organization_id: organizationId!,
          lead_id: appointment.lead_id,
          appointment_id: appointment.id,
          kind: patch.status ? `appointment_${patch.status}` : "appointment_updated",
          body: patch.starts_at ? `Moved to ${new Date(patch.starts_at).toLocaleString()}.` : null,
        } as never);
      }

      if (patch.status === "completed") {
        await enqueueAutomations(supabase, {
          organizationId: organizationId!,
          trigger: "appointment_completed",
          businessName: businessName ?? null,
          lead: appointment.lead_id
            ? {
                id: appointment.lead_id,
                name: appointment.name,
                email: appointment.email ?? null,
                phone: appointment.phone ?? null,
              }
            : null,
          appointment,
        });
        await flushAutomations(organizationId!);
      }
    },
    onSuccess: () => {
      toast.success("Booking updated.");
      for (const key of [
        "appointments",
        "leads",
        "automation_runs",
        "notifications",
        "customers",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
      }
      void queryClient.invalidateQueries({ queryKey: ["lead_activities"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that booking.")),
  });
}

/* ------------------------------- automations -------------------------------- */

export function useAutomations(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["automations", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select(
          "id, name, trigger_event, is_active, created_at, automation_steps!automation_steps_automation_id_fkey(id, sort_order, delay_minutes, action_type, channel, subject, body)",
        )
        .eq("organization_id", organizationId!)
        .order("created_at");
      if (error) throw error;
      return data.map((a) => ({
        ...a,
        automation_steps: [...(a.automation_steps ?? [])].sort(
          (x, y) => x.sort_order - y.sort_order,
        ),
      }));
    },
  });
}

export function useAutomationRuns(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["automation_runs", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_runs")
        .select(
          "id, action_type, recipient, subject, body, status, scheduled_for, sent_at, trigger_event, leads(name)",
        )
        .eq("organization_id", organizationId!)
        .order("scheduled_for", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useSaveAutomation(organizationId: string | undefined) {
  const invalidate = useInvalidate(["automations"], organizationId);
  return useMutation({
    mutationFn: async (input: {
      id?: string | undefined;
      name: string;
      trigger_event: string;
      is_active?: boolean;
    }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase
          .from("automations")
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("automations")
        .insert({ ...input, organization_id: organizationId! } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that automation.")),
  });
}

export function useDeleteAutomation(organizationId: string | undefined) {
  const invalidate = useInvalidate(["automations"], organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Automation removed.");
      void invalidate();
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't remove that automation.")),
  });
}

export function useSaveAutomationStep(organizationId: string | undefined) {
  const invalidate = useInvalidate(["automations"], organizationId);
  return useMutation({
    mutationFn: async (input: {
      id?: string | undefined;
      automation_id: string;
      sort_order: number;
      delay_minutes: number;
      action_type: string;
      subject: string;
      body: string;
    }) => {
      const row = { ...input, channel: input.action_type };
      if (input.id) {
        const { id: _id, ...patch } = row;
        const { error } = await supabase
          .from("automation_steps")
          .update(patch as never)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("automation_steps")
        .insert({ ...row, organization_id: organizationId! } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Step saved.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that step.")),
  });
}

export function useDeleteAutomationStep(organizationId: string | undefined) {
  const invalidate = useInvalidate(["automations"], organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't remove that step.")),
  });
}

export function useInstallRecipe(organizationId: string | undefined) {
  const invalidate = useInvalidate(["automations"], organizationId);
  return useMutation({
    mutationFn: async (recipe: (typeof AUTOMATION_RECIPES)[number]) => {
      const { data, error } = await supabase
        .from("automations")
        .insert({
          organization_id: organizationId!,
          name: recipe.name,
          trigger_event: recipe.trigger_event,
          is_active: true,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const { error: stepError } = await supabase.from("automation_steps").insert(
        recipe.steps.map((step, index) => ({
          organization_id: organizationId!,
          automation_id: data.id,
          sort_order: index,
          delay_minutes: step.delay_minutes,
          action_type: step.action_type,
          channel: step.action_type,
          subject: step.subject,
          body: step.body,
        })) as never,
      );
      if (stepError) throw stepError;
    },
    onSuccess: () => {
      toast.success("Automation added and switched on.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't add that automation.")),
  });
}

/** Delivers anything that has come due — runs when the automations screen opens. */
export function useProcessDueRuns(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => flushAutomations(organizationId!),
    onSuccess: (result) => {
      if (result?.sent) {
        void queryClient.invalidateQueries({ queryKey: ["automation_runs", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] });
      }
    },
  });
}

/* ------------------------------ quote builder ------------------------------- */

export function useQuoteBuilder(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["quote_builder", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data: form, error } = await supabase
        .from("quote_forms")
        .select("id, name, base_price, min_price, max_price, is_active")
        .eq("organization_id", organizationId!)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!form) return { form: null, questions: [], addons: [] };

      const [{ data: questions }, { data: options }, { data: addons }] = await Promise.all([
        supabase
          .from("quote_questions")
          .select("id, label, helper_text, question_type, sort_order")
          .eq("form_id", form.id)
          .order("sort_order"),
        supabase
          .from("quote_options")
          .select("id, question_id, label, price_modifier, modifier_type, sort_order")
          .eq("organization_id", organizationId!)
          .order("sort_order"),
        supabase
          .from("quote_addons")
          .select("id, label, description, price, sort_order")
          .eq("form_id", form.id)
          .order("sort_order"),
      ]);

      return {
        form,
        questions: (questions ?? []).map((q) => ({
          ...q,
          options: (options ?? []).filter((o) => o.question_id === q.id),
        })),
        addons: addons ?? [],
      };
    },
  });
}

export function useQuoteBuilderMutations(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quote_builder", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["quote_requests", organizationId] }),
    ]);

  const useWrapped = <T>(fn: (input: T) => Promise<unknown>, success?: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        if (success) toast.success(success);
        void invalidate();
      },
      onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that.")),
    });

  const saveForm = useWrapped(
    async (input: {
      id?: string | undefined;
      name: string;
      base_price: number;
      min_price: number;
      max_price: number;
      is_active: boolean;
    }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase
          .from("quote_forms")
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("quote_forms")
        .insert({ ...input, organization_id: organizationId! } as never);
      if (error) throw error;
    },
    "Quote calculator saved.",
  );

  const saveQuestion = useWrapped(
    async (input: {
      id?: string | undefined;
      form_id: string;
      label: string;
      helper_text?: string | null;
      sort_order: number;
    }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase
          .from("quote_questions")
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("quote_questions").insert({
        ...input,
        question_type: "single",
        organization_id: organizationId!,
      } as never);
      if (error) throw error;
    },
    "Question saved.",
  );

  const deleteQuestion = useWrapped(async (id: string) => {
    const { error } = await supabase.from("quote_questions").delete().eq("id", id);
    if (error) throw error;
  }, "Question removed.");

  const saveOption = useWrapped(
    async (input: {
      id?: string | undefined;
      question_id: string;
      label: string;
      price_modifier: number;
      modifier_type: string;
      sort_order: number;
    }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase
          .from("quote_options")
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("quote_options")
        .insert({ ...input, organization_id: organizationId! } as never);
      if (error) throw error;
    },
    "Option saved.",
  );

  const deleteOption = useWrapped(async (id: string) => {
    const { error } = await supabase.from("quote_options").delete().eq("id", id);
    if (error) throw error;
  }, "Option removed.");

  const saveAddon = useWrapped(
    async (input: {
      id?: string | undefined;
      form_id: string;
      label: string;
      description?: string | null;
      price: number;
      sort_order: number;
    }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase
          .from("quote_addons")
          .update(patch as never)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("quote_addons")
        .insert({ ...input, organization_id: organizationId! } as never);
      if (error) throw error;
    },
    "Add-on saved.",
  );

  const deleteAddon = useWrapped(async (id: string) => {
    const { error } = await supabase.from("quote_addons").delete().eq("id", id);
    if (error) throw error;
  }, "Add-on removed.");

  return {
    saveForm,
    saveQuestion,
    deleteQuestion,
    saveOption,
    deleteOption,
    saveAddon,
    deleteAddon,
  };
}

/* --------------------------- website generation & review --------------------------- */

export function useWebsiteRequests(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["website_requests", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_requests")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateWebsiteRequest(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      details?: string | null;
      kind?: string;
      priority?: string;
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from("website_requests").insert({
        organization_id: organizationId!,
        created_by: userId,
        title: input.title,
        details: input.details ?? null,
        kind: input.kind ?? "change",
        priority: input.priority ?? "normal",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request sent to the Revora team.");
      void queryClient.invalidateQueries({ queryKey: ["website_requests"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't send that request.")),
  });
}

export function useUpdateWebsiteRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("website_requests")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request updated.");
      void queryClient.invalidateQueries({ queryKey: ["website_requests"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that request.")),
  });
}

/** Regenerates the website plan from the client's real, stored information. */
export function useGenerateWebsite(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const orgId = organizationId!;
      const [org, profile, services, media, socials, forms] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, industry, conversion_goal")
          .eq("id", orgId)
          .maybeSingle(),
        supabase.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
        supabase.from("services").select("name, description, price").eq("organization_id", orgId),
        supabase.from("media").select("id").eq("organization_id", orgId),
        supabase.from("social_profiles").select("id").eq("organization_id", orgId),
        supabase.from("quote_forms").select("id").eq("organization_id", orgId),
      ]);
      const p = (profile.data ?? {}) as Record<string, unknown>;
      const testimonials = Array.isArray(p["testimonials"]) ? (p["testimonials"] as unknown[]) : [];
      const goalsRaw = (p["website_goals"] as string[] | undefined) ?? [];
      const goals = (
        goalsRaw.length ? goalsRaw : [(org.data?.conversion_goal as string | null) ?? "quote"]
      ) as GoalKey[];
      const plan = generateWebsitePlan({
        businessName: (org.data?.name as string) ?? "",
        industry: (org.data?.industry as string) ?? "",
        description: (p["description"] as string) ?? null,
        city: (p["city"] as string) ?? null,
        state: (p["state"] as string) ?? null,
        serviceArea: (p["service_area"] as string) ?? null,
        phone: (p["phone"] as string) ?? null,
        email: (p["email"] as string) ?? null,
        goals: goals.length ? goals : ["quote"],
        services: (services.data ?? []) as {
          name: string;
          description?: string | null;
          price?: number | null;
        }[],
        photoCount: (media.data ?? []).length + ((p["hero_image_url"] as string) ? 1 : 0),
        testimonialCount: testimonials.length,
        hasCredentials: Boolean(p["certifications"] || p["awards"] || p["years_in_business"]),
        hasHours: Boolean(p["hours"]),
        socialLinks: (socials.data ?? []).length,
      });

      const keepState = await nextPublishState(supabase, orgId);
      const { error } = await supabase.from("website_settings").upsert(
        {
          organization_id: orgId,
          template: plan.template,
          generation: plan as unknown as Record<string, unknown>,
          generated_at: plan.generatedAt,
          review_state: "ready_for_review",
          seo: {
            headline: plan.headline,
            subheadline: plan.subheadline,
            meta_description: plan.metaDescription,
            primary_cta_label: plan.primaryCtaLabel,
            title: plan.seoTitle,
          },
          publish_state: keepState,
        } as never,
        { onConflict: "organization_id" },
      );
      if (error) throw error;
      if (!(forms.data ?? []).length && goals.includes("quote")) {
        // no quote form yet — surfaced to the client as a setup item, not auto-faked
      }
      return plan;
    },
    onSuccess: () => {
      toast.success("Website generated. Review it before launch.");
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't generate the website.")),
  });
}

export function useSetWebsiteReviewState(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ state, message }: { state: string; message?: string }) => {
      const patch: Record<string, unknown> = {
        organization_id: organizationId!,
        review_state: state,
      };
      if (state === "approved") {
        patch["approved_at"] = new Date().toISOString();
        patch["approved_by"] = (await supabase.auth.getUser()).data.user?.id ?? null;
      }
      const { error } = await supabase
        .from("website_settings")
        .upsert(patch as never, { onConflict: "organization_id" });
      if (error) throw error;
      return message;
    },
    onSuccess: (message) => {
      toast.success(message || "Website status updated.");
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't update the website status.")),
  });
}
