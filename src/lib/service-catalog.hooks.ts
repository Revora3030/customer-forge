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

/** Errors the quote RPCs raise, in owner language. */
const QUOTE_ERRORS: Record<string, string> = {
  quote_not_found: "That quote wasn't found, or you can't edit it.",
  quote_needs_lines: "Add at least one line to the quote.",
  not_allowed: "You don't have permission to edit quotes in this workspace.",
};

function quoteError(error: { message?: string }): Error {
  const message = String(error.message ?? "");
  const code = Object.keys(QUOTE_ERRORS).find((key) => message.includes(key));
  return code ? new Error(QUOTE_ERRORS[code]) : (error as Error);
}

/**
 * Saves a quote and replaces its lines in ONE transaction
 * (`save_owner_quote`, SECURITY INVOKER, tenant-checked): a failure leaves the
 * previous quote untouched, so lines can never be doubled or lost. Returns the
 * quote id, which the editor keeps so a retry updates instead of re-creating.
 * `accepted_at` is set by the database only on the change to "accepted".
 */
export function useSaveQuote(organizationId: string | undefined) {
  const invalidate = useInvalidateQuotes(organizationId);
  return useMutation({
    mutationFn: async (input: QuoteInput) => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      const name = input.customer_name.trim();
      if (!name) throw new Error("Add the customer's name.");
      const lines = cleanLines(input.lines);
      if (!lines.length) throw new Error("Add at least one line to the quote.");
      const { data, error } = await supabase.rpc(
        "save_owner_quote" as never,
        {
          p_organization_id: organizationId,
          p_quote_id: input.id ?? null,
          p_customer_name: name.slice(0, 160),
          p_customer_email: input.customer_email?.trim() || null,
          p_customer_phone: input.customer_phone?.trim() || null,
          p_lead_id: input.lead_id,
          p_notes: input.notes?.trim() || null,
          p_status: input.status,
          p_lines: lines.map((line, index) => ({
            service_id: line.service_id,
            name: line.name,
            unit_price: line.unit_price,
            quantity: line.quantity,
            sort_order: index,
          })),
        } as never,
      );
      if (error) throw quoteError(error);
      const id = typeof data === "string" ? data : null;
      if (!id) throw new Error("The quote couldn't be confirmed as saved. Refresh and check.");
      return id;
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
      // accepted_at is maintained by the quotes trigger on the transition.
      const { data, error } = await supabase
        .from("quotes")
        .update({ status })
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You don't have permission to change that quote.");
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't update that quote.")),
  });
}

/**
 * Deletes a quote. RLS lets only managers and owners delete, and a refused
 * delete returns no error, just no rows — so zero rows is reported as "not
 * allowed" instead of a false "Quote deleted".
 */
export function useDeleteQuote(organizationId: string | undefined) {
  const invalidate = useInvalidateQuotes(organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("quotes")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That quote wasn't deleted — only managers and owners can delete quotes.");
      }
    },
    onSuccess: () => {
      toast.success("Quote deleted.");
      void invalidate();
    },
    onError: (error: Error) => {
      void invalidate();
      toast.error(friendlyError(error, "Couldn't delete that quote."));
    },
  });
}
