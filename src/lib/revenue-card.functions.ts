import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/paginate";
import { buildRevenueCard, type RevenueOrg, type RevenuePayment, type RevenueSubscription } from "@/lib/revenue-card";

/**
 * Super-admin only, read-only. Reads rows our verified Stripe webhook wrote to
 * the database; it never calls Stripe (no import, no network, no write).
 */
export const getRevenueCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCustomerOrgIds } = await import("@/lib/customer-orgs.server");

    const [orgs, payments, subs, customers] = await Promise.all([
      fetchAllRows<RevenueOrg>((from, to) =>
        supabaseAdmin
          .from("organizations")
          .select("id, name, is_demo, setup_paid_at, setup_payment_status, subscription_status")
          .order("id")
          .range(from, to),
      ),
      fetchAllRows<RevenuePayment>((from, to) =>
        supabaseAdmin
          .from("payments")
          .select("organization_id, environment, status, amount, refunded_amount, description, metadata")
          .eq("environment", "live")
          .order("id")
          .range(from, to),
      ),
      fetchAllRows<RevenueSubscription>((from, to) =>
        supabaseAdmin
          .from("subscriptions")
          .select("organization_id, environment, status, provider_subscription_id")
          .eq("environment", "live")
          .order("id")
          .range(from, to),
      ),
      loadCustomerOrgIds(supabaseAdmin),
    ]);
    // A failed read throws so the card says so instead of showing zeros.
    const failed = [orgs.error, payments.error, subs.error].find(Boolean);
    if (failed) throw new Error("Couldn't read the revenue numbers just now. Refresh in a moment.");

    return buildRevenueCard({
      orgs: orgs.rows.filter((o) => customers.has(o.id)),
      payments: payments.rows,
      subscriptions: subs.rows,
    });
  });
