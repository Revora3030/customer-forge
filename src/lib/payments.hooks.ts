import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { fetchAllRows } from "@/lib/paginate";

export type PaymentProduct = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  plan_id: string | null;
  amount: number;
  currency: string;
  billing_interval: string | null;
};

/** Public catalog of Revora services and plans that can be paid for. */
export function usePaymentProducts() {
  return useQuery({
    queryKey: ["payment_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_products")
        .select("id, name, description, kind, plan_id, amount, currency, billing_interval")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, amount: Number(p.amount) })) as PaymentProduct[];
    },
  });
}

/** This workspace's payments (RLS restricts rows to the caller's business). */
export function usePayments(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["payments", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, product_id, plan_id, description, amount, currency, status, payment_provider, environment, refund_status, refunded_amount, created_at, completed_at, metadata",
        )
        .eq("organization_id", organizationId!)
        .eq("environment", getStripeEnvironment())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** All payments across the platform (super admins only, enforced by RLS). */
export function useAllPayments(enabled: boolean) {
  return useQuery({
    queryKey: ["payments", "all"],
    enabled,
    // Webhooks write payments in the background, so keep the ledger live.
    refetchInterval: 60_000,
    queryFn: async () => {
      // Every payment is listed — no arbitrary ceiling hiding real money.
      const { rows, error } = await fetchAllRows((from, to) =>
        supabase
          .from("payments")
          .select(
            "id, organization_id, product_id, plan_id, description, amount, currency, status, environment, customer_email, refund_status, refunded_amount, created_at, completed_at, organizations(name, slug)",
          )
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (error) throw error;
      return rows;
    },
  });
}

export function usePaymentEvents(paymentId: string | null) {
  return useQuery({
    queryKey: ["payment_events", paymentId],
    enabled: !!paymentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_events")
        .select("id, event_type, verification_status, processed, created_at")
        .eq("payment_id", paymentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
