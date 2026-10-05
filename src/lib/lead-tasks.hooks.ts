import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------ CRM tasks (spec G) ------------------------------ */

// lead_tasks is new in migration 20261005140000; untyped view until types refresh.
const tasksTable = () => (supabase as unknown as import("@supabase/supabase-js").SupabaseClient).from("lead_tasks");

export type LeadTaskRow = { id: string; lead_id: string; title: string; due_at: string | null; done_at: string | null; created_at: string };

/** Tasks for one lead, or every open task in the workspace when leadId is null. */
export function useLeadTasks(organizationId: string | undefined, leadId: string | null) {
  return useQuery({
    queryKey: ["lead_tasks", organizationId, leadId],
    enabled: !!organizationId,
    queryFn: async () => {
      let query = tasksTable()
        .select("id, lead_id, title, due_at, done_at, created_at")
        .eq("organization_id", organizationId!)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(200);
      query = leadId ? query.eq("lead_id", leadId) : query.is("done_at", null);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LeadTaskRow[];
    },
  });
}

export function useLeadTaskActions(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["lead_tasks", organizationId] });
  const add = useMutation({
    mutationFn: async (input: { leadId: string; title: string; dueAt: string | null }) => {
      const { normaliseTaskTitle } = await import("@/lib/crm");
      const title = normaliseTaskTitle(input.title);
      if (!title) throw new Error("Give the task a short title.");
      const { error } = await tasksTable().insert({
        organization_id: organizationId!,
        lead_id: input.leadId,
        title,
        due_at: input.dueAt,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't add that task.")),
  });
  const toggle = useMutation({
    mutationFn: async (input: { id: string; done: boolean }) => {
      const { error } = await tasksTable()
        .update({ done_at: input.done ? new Date().toISOString() : null })
        .eq("id", input.id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that task.")),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tasksTable().delete().eq("id", id).eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(friendlyError(error, "Only a manager can delete tasks.")),
  });
  return { add, toggle, remove };
}
