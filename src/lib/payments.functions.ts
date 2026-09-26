import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseStripeEnvironment } from "@/lib/stripe-input";
import type { StripeEnv } from "@/lib/stripe.server";

/**
 * Platform-admin refund, issued through Stripe and verified before the Revora
 * record changes. Stripe is the only payment processor: there is no second
 * provider path, and the client can never mark a payment refunded itself.
 */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { paymentId: string; amount?: number; environment?: StripeEnv }) => {
    const paymentId = String(input?.paymentId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw new Error("Invalid payment");
    const amount = typeof input?.amount === "number" && input.amount > 0 ? input.amount : undefined;
    return { paymentId, amount, environment: parseStripeEnvironment(input?.environment) };
  })
  .handler(async ({ data, context }) => {
    // Super-admin only, verified through an authenticated (RLS) read — never
    // with admin rights, and never from a client-supplied claim.
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const { createStripeClient } = await import("@/lib/stripe.server");
    const { adminClient, logPaymentActivity, logPaymentError, stripeChargeRef } =
      await import("@/lib/payments.server");

    const admin = await adminClient();
    const { data: payment } = await admin
      .from("payments")
      .select("*")
      .eq("id", data.paymentId)
      .single();
    if (!payment) return { ok: false as const, error: "Payment not found." };
    if (payment.status !== "completed" && payment.status !== "partially_refunded") {
      return { ok: false as const, error: "Only completed payments can be refunded." };
    }

    const reference = stripeChargeRef(payment);
    if (!reference) {
      return {
        ok: false as const,
        error: "This payment has no Stripe charge reference, so it cannot be refunded here.",
      };
    }

    const remaining = Number(payment.amount) - Number(payment.refunded_amount ?? 0);
    if (remaining <= 0.005)
      return { ok: false as const, error: "This payment has already been fully refunded." };
    if (data.amount && data.amount > remaining + 0.005) {
      return {
        ok: false as const,
        error: `The most that can still be refunded is ${remaining.toFixed(2)}.`,
      };
    }

    try {
      // The refund ALWAYS uses the environment the payment was taken in.
      // Client input is never allowed to redirect a refund to Stripe sandbox.
      const stripe = createStripeClient(payment.environment === "live" ? "live" : "sandbox");
      const refund = await stripe.refunds.create({
        ...(reference.kind === "payment_intent"
          ? { payment_intent: reference.id }
          : { charge: reference.id }),
        ...(data.amount ? { amount: Math.round(data.amount * 100) } : {}),
      });
      if (!["succeeded", "pending"].includes(String(refund.status))) {
        return {
          ok: false as const,
          error: "The refund was not accepted. Check the payment in Stripe and try again.",
        };
      }

      const refunded = Number(payment.refunded_amount) + (data.amount ?? Number(payment.amount));
      const full = refunded >= Number(payment.amount) - 0.005;
      const { data: updated, error: refundWriteError } = await admin
        .from("payments")
        .update({
          status: full ? "refunded" : "partially_refunded",
          refund_status: String(refund.status),
          refunded_amount: refunded,
        })
        .eq("id", payment.id)
        .select("*")
        .single();
      if (refundWriteError) {
        logPaymentError("refund_record", {
          paymentId: payment.id,
          code: refundWriteError.code ?? null,
        });
        return {
          ok: false as const,
          error:
            "The refund went through at Stripe but we could not record it. Check the payment record before retrying.",
        };
      }
      if (updated) await logPaymentActivity(admin, updated, "refunded");
      return { ok: true as const, status: full ? "refunded" : "partially_refunded" };
    } catch (error) {
      // Raw Stripe errors stay server-side; the admin sees a safe message.
      logPaymentError("refund", {
        paymentId: payment.id,
        message: error instanceof Error ? error.message : "unknown",
      });
      return { ok: false as const, error: "The refund could not be completed. Please try again." };
    }
  });
