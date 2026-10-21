/**
 * Tenant-scoped reads and writes behind the shared services catalog: owner
 * quotes with service line items, and the rows the Services page counts.
 * Every query filters by organization_id in addition to RLS.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { cleanLines, type QuoteLineDraft, type QuoteStatus } from "@/lib/service-catalog";

export const QUOTE_COLUMNS =
  "id, customer_name, customer_email, customer_phone, lead_id, appointment_id, status, notes, accepted_at, created_at, updated_at, quote_line_items(id, service_id, name, unit_price, quantity, sort_order)";

export function useQuotes(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["quotes", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(QUOTE_COLUMNS)
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.map((quote) => ({
        ...quote,
        quote_line_items: [...(quote.quote_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
  });
}

/** Which services each quote line names — for the Services page counts. */
export function useQuoteLineServiceRefs(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["quote_line_items", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_line_items")
        .select("quote_id, service_id")
        .eq("organization_id", organizationId!)
        .not("service_id", "is", null);
      if (error) throw error;
      return data;
    },
  });
}

/** The workspace's website pages, to tell whether a service has its own page. */
export function useWebsitePageRefs(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["website_pages", organizationId, "refs"],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_pages")
        .select("slug, title, kind, is_visible")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateQuotes(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["quotes", "quote_line_items"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key, organizationId] }),
      ),
    );
}

export type QuoteInput = {
  id?: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  lead_id: string | null;
  notes: string | null;
  status: QuoteStatus;
  lines: QuoteLineDraft[];
};

export function useSaveQuote(organizationId: string | undefined) {
  const invalidate = useInvalidateQuotes(organizationId);
  return useMutation({
    mutationFn: async (input: QuoteInput) => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      const name = input.customer_name.trim();
      if (!name) throw new Error("Add the customer's name.");
      const lines = cleanLines(input.lines);
      if (!lines.length) throw new Error("Add at least one line to the quote.");
      const record = {
        customer_name: name.slice(0, 160),
        customer_email: input.customer_email?.trim() || null,
        customer_phone: input.customer_phone?.trim() || null,
        lead_id: input.lead_id,
        notes: input.notes?.trim() || null,
        status: input.status,
        accepted_at: input.status === "accepted" ? new Date().toISOString() : null,
      };

      let quoteId = input.id;
      if (quoteId) {
        const { error } = await supabase
          .from("quotes")
          .update(record)
          .eq("id", quoteId)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("quotes")
          .insert({ ...record, organization_id: organizationId })
          .select("id")
          .single();
        if (error) throw error;
        quoteId = data.id;
      }

      // New lines are written before the old ones are removed, so a failed
      // write never leaves a saved quote with no lines.
      const { data: inserted, error: lineError } = await supabase
        .from("quote_line_items")
        .insert(
          lines.map((line, index) => ({
            organization_id: organizationId,
            quote_id: quoteId!,
            service_id: line.service_id,
            name: line.name,
            unit_price: line.unit_price,
            quantity: line.quantity,
            sort_order: index,
          })),
        )
        .select("id");
      if (lineError) throw lineError;
      const keep = (inserted ?? []).map((row) => row.id);
      if (input.id && keep.length) {
        const { error } = await supabase
          .from("quote_line_items")
          .delete()
          .eq("organization_id", organizationId)
          .eq("quote_id", quoteId!)
          .not("id", "in", `(${keep.join(",")})`);
        if (error) throw error;
      }
      return quoteId!;
    },
    onSuccess: () => {
      toast.success("Quote saved.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that quote.")),
  });
}

export function useSetQuoteStatus(organizationId: string | undefined) {
  const invalidate = useInvalidateQuotes(organizationId);
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuoteStatus }) => {
      const { error } = await supabase
        .from("quotes")
        .update({ status, accepted_at: status === "accepted" ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that quote.")),
  });
}

/** Records the booking made from an accepted quote so it is offered only once. */
export function useLinkQuoteBooking(organizationId: string | undefined) {
  const invalidate = useInvalidateQuotes(organizationId);
  return useMutation({
    mutationFn: async ({ id, appointmentId }: { id: string; appointmentId: string }) => {
      const { error } = await supabase
        .from("quotes")
        .update({ appointment_id: appointmentId })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) =>
      toast.warning(
        friendlyError(error, "The booking was added, but the quote couldn't be marked as booked."),
      ),
  });
}

export function useDeleteQuote(organizationId: string | undefined) {
  const invalidate = useInvalidateQuotes(organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quotes")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quote deleted.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't delete that quote.")),
  });
}
