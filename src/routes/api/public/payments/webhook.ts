import { createFileRoute } from "@tanstack/react-router";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { DEFAULT_OFFER_RATES } from "@/lib/offer";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { isPlatformOwnerAccount, PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";
import { completedWebhookDuplicate, finishClaimedWebhook } from "@/lib/webhook-lifecycle";

/** Minimal Stripe webhook event envelope — narrowed per-handler. */
type StripeWebhookEvent = {
  id?: string;
  type: string;
  // Stripe delivers arbitrary JSON per event type; the shape is narrowed by
  // the individual handlers, so the raw envelope stays permissive here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { object: any };
};

async function handleEvent(event: StripeWebhookEvent, env: StripeEnv) {
  const { adminClient } = await import("@/lib/payments.server");
  const {
    syncStripeSubscription,
    recordStripeTransaction,
    planFromPriceLookupKey,
    resolvePriceLookupKey,
    GROWTH_PLAN_ID,
  } = await import("@/lib/stripe-billing.server");
  const admin = await adminClient();
  const object = event.data.object;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const lifecycle = await import("@/lib/billing-lifecycle.server");
      const payload =
        event.type === "customer.subscription.deleted" ? { ...object, status: "canceled" } : object;

      // Snapshot the previous row so plan changes and new cancellations are detectable.
      const { data: previous, error: previousError } = object?.id
        ? await admin
            .from("subscriptions")
            .select("plan_id, cancel_at_period_end, status")
            .eq("provider_subscription_id", String(object.id))
            .eq("environment", env)
            .maybeSingle()
        : { data: null, error: null };
      if (previousError) throw new Error(`subscription_snapshot_failed:${previousError.code ?? "database error"}`);

      const result = await syncStripeSubscription(admin, payload, env);
      if (!result.ok || !result.organizationId) {
        console.error("[payments:webhook] subscription not linked", result.reason);
        break;
      }
      const organizationId = result.organizationId;
      const stripeStatus = String(payload?.status ?? "");
      const periodEnd =
        payload?.items?.data?.[0]?.current_period_end ?? payload?.current_period_end;
      const accessUntil =
        typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null;

      if (
        event.type === "customer.subscription.created" &&
        ["active", "trialing"].includes(stripeStatus)
      ) {
        const priceKey = payload?.items?.data?.[0]?.price
          ? resolvePriceLookupKey(payload.items.data[0].price)
          : null;
        const mapped = planFromPriceLookupKey(priceKey);
        await lifecycle.handleSubscriptionActivated(admin, {
          organizationId,
          stripeSubscriptionId: String(object.id),
          planId: mapped?.planId ?? (payload?.metadata?.planId as string | undefined) ?? null,
          interval: mapped?.interval ?? null,
          environment: env,
        });
      }

      if (event.type === "customer.subscription.updated") {
        const newPriceKey = payload?.items?.data?.[0]?.price
          ? resolvePriceLookupKey(payload.items.data[0].price)
          : null;
        const newPlan = planFromPriceLookupKey(newPriceKey)?.planId ?? null;
        if (newPlan && previous?.plan_id && newPlan !== previous.plan_id) {
          await lifecycle.handlePlanChanged(admin, {
            organizationId,
            stripeSubscriptionId: String(object.id),
            previousPlanId: previous.plan_id,
            newPlanId: newPlan,
            environment: env,
          });
        }
        if (payload?.cancel_at_period_end && !previous?.cancel_at_period_end) {
          await lifecycle.handleSubscriptionCanceled(admin, {
            organizationId,
            stripeSubscriptionId: String(object.id),
            accessUntil,
            environment: env,
            phase: "scheduled",
          });
        }
      }

      if (event.type === "customer.subscription.deleted") {
        await lifecycle.handleSubscriptionCanceled(admin, {
          organizationId,
          stripeSubscriptionId: String(object.id),
          accessUntil,
          environment: env,
          phase: "ended",
        });
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const line = object?.lines?.data?.[0];
      let organizationId =
        (object?.subscription_details?.metadata?.organizationId as string | undefined) ??
        (object?.parent?.subscription_details?.metadata?.organizationId as string | undefined) ??
        (line?.metadata?.organizationId as string | undefined) ??
        (object?.metadata?.organizationId as string | undefined);
      if (!organizationId) {
        const { invoiceSubscriptionId, organizationForStripeSubscription } =
          await import("@/lib/webhook-invoice");
        // Renewal invoices can arrive without workspace metadata. The stored
        // subscription (same Stripe environment) still knows its workspace, so
        // look it up instead of silently dropping the payment.
        organizationId =
          (await organizationForStripeSubscription(
            admin,
            invoiceSubscriptionId(object),
            env,
          )) ?? undefined;
      }
      if (!organizationId) {
        console.error("[payments:webhook] invoice without organization metadata", object?.id);
        break;
      }
      const priceKey = line?.price ? resolvePriceLookupKey(line.price) : null;
      const mapped = planFromPriceLookupKey(priceKey);
      const paid = event.type === "invoice.paid";
      await recordStripeTransaction(admin, {
        organizationId,
        stripeId: String(object?.id ?? ""),
        amount: Number(paid ? (object?.amount_paid ?? 0) : (object?.amount_due ?? 0)) / 100,
        currency: String(object?.currency ?? "usd"),
        description: `Revora ${mapped?.planId ? mapped.planId : "subscription"} ${mapped?.interval === "annual" ? "(annual)" : "(monthly)"}`,
        status: paid ? "completed" : "failed",
        planId: mapped?.planId ?? null,
        interval: mapped?.interval ?? null,
        customerEmail: (object?.customer_email as string | undefined) ?? null,
        environment: env,
        periodStart: line?.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
        periodEnd: line?.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
      });
      // Dunning: renewal payment intents carry no workspace metadata, so the
      // invoice event is the only reliable place to tell the customer.
      if (!paid) {
        const lifecycle = await import("@/lib/billing-lifecycle.server");
        const nextAttempt = object?.next_payment_attempt;
        await lifecycle.handleInvoicePaymentFailed(admin, {
          organizationId,
          invoiceId: String(object?.id ?? ""),
          attemptCount: typeof object?.attempt_count === "number" ? object.attempt_count : null,
          amountCents: typeof object?.amount_due === "number" ? object.amount_due : null,
          currency: String(object?.currency ?? "usd"),
          nextAttemptAt:
            typeof nextAttempt === "number" ? new Date(nextAttempt * 1000).toISOString() : null,
          // Invoices don't carry the bank's decline text; the email falls back
          // to generic guidance rather than an extra Stripe round-trip here.
          declineReason: null,
          environment: env,
        });
      }
      break;
    }
    case "customer.subscription.trial_will_end": {
      const organizationId = object?.metadata?.organizationId as string | undefined;
      if (!organizationId) {
        console.error("[payments:webhook] trial_will_end without organization metadata", object?.id);
        break;
      }
      const lifecycle = await import("@/lib/billing-lifecycle.server");
      const item = object?.items?.data?.[0];
      const trialEnd = object?.trial_end;
      await lifecycle.handleTrialWillEnd(admin, {
        organizationId,
        stripeSubscriptionId: String(object?.id ?? ""),
        trialEnd: typeof trialEnd === "number" ? new Date(trialEnd * 1000).toISOString() : null,
        amountCents:
          typeof item?.price?.unit_amount === "number"
            ? item.price.unit_amount * Number(item?.quantity ?? 1)
            : null,
        currency: String(item?.price?.currency ?? object?.currency ?? "usd"),
        planId: (object?.metadata?.planId as string | undefined) ?? null,
        environment: env,
      });
      break;
    }
    // Delayed payment methods (bank debits) complete the session as "unpaid"
    // and confirm the money later with async_payment_succeeded. Without this
    // case the customer paid but setup was never unlocked.
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.completed": {
      const md = (object?.metadata ?? {}) as Record<string, string | undefined>;

      // Revora Growth System: one subscription session that also carries the
      // one-time setup line. Setup is only marked paid when Stripe confirms it.
      if (md["kind"] === "growth_system" && md["organizationId"]) {
        if (object?.payment_status === "unpaid") break;
        const organizationId = md["organizationId"];

        // Never trust metadata alone: re-read the session from Stripe and check
        // the line items against the pinned catalog before granting anything.
        const { createStripeClient } = await import("@/lib/stripe.server");
        const { STRIPE_CATALOG } = await import("@/lib/stripe-catalog");
        const catalog = STRIPE_CATALOG[env];
        const stripe = createStripeClient(env);
        const session = await stripe.checkout.sessions.retrieve(String(object?.id ?? ""), {
          expand: ["line_items.data.price", "subscription", "customer"],
        });
        if (session.mode !== "subscription" || session.payment_status === "unpaid") {
          console.error("[payments:webhook] growth session not payable", session.id);
          break;
        }
        const lines = session.line_items?.data ?? [];
        const setupWaived = session.metadata?.["setupWaived"] === "true";
        if (setupWaived) {
          const userId = session.metadata?.["userId"] ?? null;
          const authUser = userId ? await admin.auth.admin.getUserById(userId) : { data: { user: null } };
          const ownerEmail = authUser.data.user?.email ?? null;
          if (!isPlatformOwnerAccount(organizationId, ownerEmail)) {
            console.error("[payments:webhook] invalid setup-fee waiver", session.id);
            break;
          }
          // A granted waiver must be auditable: record the actor, the session
          // and the verified owner email every time the $350 setup fee is
          // skipped, so the single bypass path can never be used silently.
          const { error: waiverAuditError } = await admin.from("audit_logs").insert({
            organization_id: organizationId,
            actor_id: userId,
            action: "platform_owner_setup_fee_waiver",
            entity: "checkout_session",
            entity_id: String(session.id),
            metadata: {
              provider: "stripe",
              environment: env,
              verified_owner_email: ownerEmail,
              waived_amount: DEFAULT_OFFER_RATES.setupPrice,
            },
          });
          if (waiverAuditError)
            throw new Error(
              `waiver_audit_failed:${waiverAuditError.code ?? waiverAuditError.message}`,
            );
        }
        const priceIds = lines.map((l) => l.price?.id).filter(Boolean) as string[];
        const expectedIds = setupWaived
          ? [catalog.monthly.stripePriceId]
          : [catalog.setup.stripePriceId, catalog.monthly.stripePriceId];
        const unexpected = priceIds.filter((id) => !expectedIds.includes(id));
        if (unexpected.length || !expectedIds.every((id) => priceIds.includes(id))) {
          console.error("[payments:webhook] unexpected prices on growth session", session.id);
          break;
        }
        if (setupWaived && organizationId !== PLATFORM_OWNER_ORG_ID) {
          console.error("[payments:webhook] setup waiver on non-owner workspace", session.id);
          break;
        }
        const currency = String(session.currency ?? "usd").toLowerCase();
        if (currency !== "usd") {
          console.error("[payments:webhook] non-usd growth session", session.id, currency);
          break;
        }
        const setupLine = lines.find((l) => l.price?.id === catalog.setup.stripePriceId);
        const monthlyLine = lines.find((l) => l.price?.id === catalog.monthly.stripePriceId);
        const setupCents = Math.round(DEFAULT_OFFER_RATES.setupPrice * 100);
        const monthlyCents = Math.round(DEFAULT_OFFER_RATES.monthlyPrice * 100);
        if (
          !setupWaived &&
          setupLine?.price?.unit_amount !== setupCents
        ) {
          console.error("[payments:webhook] setup amount mismatch", session.id);
          break;
        }
        if (
          monthlyLine?.price?.unit_amount !== monthlyCents ||
          monthlyLine?.price?.recurring?.interval !== "month"
        ) {
          console.error("[payments:webhook] monthly price mismatch", session.id);
          break;
        }
        const sessionOrgId =
          (session.metadata?.["organizationId"] as string | undefined) ??
          (typeof session.customer === "object" && session.customer
            ? ((session.customer as { metadata?: Record<string, string> }).metadata?.[
                "organizationId"
              ] ?? null)
            : null);
        if (sessionOrgId !== organizationId) {
          console.error("[payments:webhook] growth session org mismatch", session.id);
          break;
        }
        // Only a verified paid setup unlocks production for customer workspaces.
        // The fixed internal owner workspace is the single, verified waiver path.
        if (!setupWaived) {
          if (env === "live") {
            // All four columns move together, so every reader (access state,
            // publishing, integrations) agrees the setup is paid.
            const { error: orgError } = await admin
              .from("organizations")
              .update({
                setup_paid_at: new Date().toISOString(),
                setup_payment_status: "paid",
                setup_checkout_session_id: String(session.id),
                plan_id: GROWTH_PLAN_ID,
              })
              .eq("id", organizationId);
            if (orgError)
              throw new Error(`setup_activation_failed:${orgError.code ?? orgError.message}`);
          }
          await recordStripeTransaction(admin, {
            organizationId,
            stripeId: `setup:${String(session.id)}`,
            // Independently verified above: the setup line's own amount.
            amount: setupCents / 100,
            currency,
            description: "Revora Growth System setup fee",
            status: "completed",
            planId: GROWTH_PLAN_ID,
            interval: "monthly",
            customerEmail: (object?.customer_details?.email as string | undefined) ?? null,
            environment: env,
          });
        }
        break;
      }

      // Subscription state otherwise arrives through customer.subscription.* events.
      if (object?.mode !== "payment") break;
      if (md["kind"] !== "service" || !md["paymentId"]) break;
      if (object?.payment_status !== "paid") break;

      // A payment row belongs to exactly one Stripe environment: a sandbox
      // event can never complete (or fail) a live payment record.
      const { data: payment, error: paymentError } = await admin
        .from("payments")
        .select("*")
        .eq("id", md["paymentId"])
        .eq("payment_provider", "stripe")
        .eq("environment", env)
        .maybeSingle();
      if (paymentError)
        throw new Error(`payment_lookup_failed:${paymentError.code ?? paymentError.message}`);
      if (!payment || payment.status === "completed") break;

      const { data: updated, error: updateError } = await admin
        .from("payments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          customer_email:
            (object?.customer_details?.email as string | undefined) ?? payment.customer_email,
          metadata: {
            ...((payment.metadata as Record<string, unknown> | null) ?? {}),
            stripe_session_id: String(object?.id ?? ""),
            stripe_payment_intent:
              typeof object?.payment_intent === "string" ? object.payment_intent : null,
          },
        })
        .eq("id", payment.id)
        .select("*")
        .single();
      if (updateError)
        throw new Error(`payment_complete_failed:${updateError.code ?? updateError.message}`);

      if (updated) {
        const { applyEntitlement, logPaymentActivity } = await import("@/lib/payments.server");
        await applyEntitlement(admin, updated);
        await logPaymentActivity(admin, updated, "completed");
      }
      break;
    }
    case "checkout.session.async_payment_failed": {
      const md = (object?.metadata ?? {}) as Record<string, string | undefined>;
      const organizationId = md["organizationId"];
      if (organizationId) {
        const { error: notifyError } = await admin.from("notifications").insert({
          organization_id: organizationId,
          title: "Payment did not go through",
          body: "Your bank payment for Revora was declined or returned. Nothing was charged — please try again with another payment method.",
          kind: "warning",
          link: "/app/billing",
        });
        if (notifyError)
          throw new Error(`async_payment_notification_failed:${notifyError.code ?? notifyError.message}`);
      }
      if (md["kind"] !== "service" || !md["paymentId"]) break;
      const { data: payment, error: paymentLookupError } = await admin
        .from("payments")
        .select("*")
        .eq("id", md["paymentId"])
        .eq("payment_provider", "stripe")
        .eq("environment", env)
        .maybeSingle();
      if (paymentLookupError) throw new Error(`payment_lookup_failed:${paymentLookupError.code ?? "database error"}`);
      if (!payment || payment.status === "completed") break;
      const { error: failError } = await admin
        .from("payments")
        .update({ status: "failed", failure_reason: "Bank payment failed" })
        .eq("id", payment.id);
      if (failError) throw new Error(`payment_fail_failed:${failError.code ?? failError.message}`);
      break;
    }
    case "checkout.session.expired": {
      const md = (object?.metadata ?? {}) as Record<string, string | undefined>;
      if (md["kind"] !== "service" || !md["paymentId"]) break;
      const { data: payment, error: expiredLookupError } = await admin
        .from("payments")
        .select("*")
        .eq("id", md["paymentId"])
        .eq("payment_provider", "stripe")
        .eq("environment", env)
        .maybeSingle();
      if (expiredLookupError)
        throw new Error(
          `payment_lookup_failed:${expiredLookupError.code ?? expiredLookupError.message}`,
        );
      if (!payment || payment.status === "completed") break;
      const { data: failed, error: failError } = await admin
        .from("payments")
        .update({ status: "failed", failure_reason: "Checkout session expired" })
        .eq("id", payment.id)
        .select("*")
        .single();
      if (failError) throw new Error(`payment_fail_failed:${failError.code ?? failError.message}`);
      if (failed) {
        const { logPaymentActivity } = await import("@/lib/payments.server");
        await logPaymentActivity(admin, failed, "failed");
      }
      break;
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      // Bookkeeping/observability only — activation always comes from the
      // checkout session and subscription events above, never from here.
      const organizationId = (object?.metadata?.organizationId as string | undefined) ?? null;
      const succeeded = event.type === "payment_intent.succeeded";
      if (organizationId) {
        const { error: auditError } = await admin.from("audit_logs").insert({
          organization_id: organizationId,
          action: `payment_intent.${succeeded ? "succeeded" : "failed"}`,
          entity: "payment_intent",
          entity_id: String(object?.id ?? ""),
          metadata: {
            provider: "stripe",
            environment: env,
            amount: Number(object?.amount ?? 0) / 100,
            currency: String(object?.currency ?? "usd"),
            failure_reason: succeeded
              ? null
              : ((object?.last_payment_error?.message as string | undefined) ??
                "Card payment failed"),
          },
        });
        if (auditError)
          throw new Error(`payment_intent_audit_failed:${auditError.code ?? auditError.message}`);
        // Only real (live) card failures warn a real customer.
        if (!succeeded && env === "live") {
          const { error: notifyError } = await admin.from("notifications").insert({
            organization_id: organizationId,
            title: "Card payment failed",
            body: `${(object?.last_payment_error?.message as string | undefined) ?? "The card payment did not go through."} Update your payment method to activate or keep your Revora system.`,
            kind: "warning",
            link: "/app/billing",
          });
          if (notifyError)
            throw new Error(
              `payment_intent_notification_failed:${notifyError.code ?? notifyError.message}`,
            );
        }
      }
      break;
    }
    default:
      // Unhandled event types are acknowledged without side effects.
      break;
  }
}

/**
 * Event-level idempotency: Stripe delivers at least once, so a verified event
 * id is claimed in `payment_events` (unique per provider) before any side
 * effect runs. A duplicate delivery short-circuits with 200; a transient
 * database failure is reported as retryable and never treated as a duplicate.
 */
async function claimEvent(
  event: StripeWebhookEvent,
  env: StripeEnv,
) {
  const { adminClient } = await import("@/lib/payments.server");
  const { classifyClaimError, organizationIdFromStripeObject } =
    await import("@/lib/webhook-claim");
  const admin = await adminClient();
  const eventId = String(event.id ?? "");
  const organizationId = organizationIdFromStripeObject(event.data?.object);
  if (!eventId) throw new Error("Verified webhook has no event ID.");
  const { error } = await admin.from("payment_events").insert({
    provider: "stripe",
    provider_event_id: eventId,
    event_type: event.type,
    resource_id: String(event.data?.object?.id ?? ""),
    organization_id: organizationId,
    verification_status: "verified",
    processed: false,
    payload: { environment: env, type: event.type },
  });
  if (error) {
    const outcome = classifyClaimError(error);
    if (outcome === "duplicate") {
      const { data: previous, error: readError } = await admin
        .from("payment_events")
        .select("processed,verification_status,organization_id,event_type,resource_id,payload")
        .eq("provider", "stripe")
        .eq("provider_event_id", eventId)
        .maybeSingle();
      return { outcome: completedWebhookDuplicate(previous, readError, { organizationId, eventType: event.type, resourceId: String(event.data?.object?.id ?? ""), environment: env }) ? "duplicate" as const : "transient" as const, admin, eventId, organizationId };
    }
    if (outcome === "transient") {
      console.error("[payments:webhook] claim failed (retryable)", error.message);
    }
    return { outcome, admin, eventId, organizationId };
  }
  return { outcome: "claimed" as const, admin, eventId, organizationId };
}

/**
 * Links the processed event row to the payment record it produced, so an
 * authenticated member can see their own payment history through RLS without
 * any policy being weakened.
 */
async function associateEvent(
  admin: Awaited<ReturnType<typeof import("@/lib/payments.server")["adminClient"]>>,
  eventId: string,
  organizationId: string | null,
  resourceId: string,
  env: StripeEnv,
) {
  let paymentId: string | null = null;
  if (organizationId && resourceId) {
    for (const stripeId of [resourceId, `setup:${resourceId}`]) {
      const { data, error } = await admin
        .from("payments")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("payment_provider", "stripe")
        .eq("environment", env)
        .contains("metadata", { stripe_id: stripeId })
        .maybeSingle();
      if (error) throw new Error(`event_payment_lookup_failed:${error.code ?? "database error"}`);
      if (data?.id) {
        paymentId = data.id as string;
        break;
      }
    }
    if (!paymentId) {
      const { data, error } = await admin
        .from("payments")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("payment_provider", "stripe")
        .eq("environment", env)
        .contains("metadata", { stripe_session_id: resourceId })
        .maybeSingle();
      if (error) throw new Error(`event_payment_lookup_failed:${error.code ?? "database error"}`);
      paymentId = (data?.id as string | undefined) ?? null;
    }
  }
  const { data: settled, error: settlementError } = await admin
    .from("payment_events")
    .update({
      processed: true,
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(paymentId ? { payment_id: paymentId } : {}),
    })
    .eq("provider", "stripe")
    .eq("provider_event_id", eventId)
    .eq("processed", false)
    .contains("payload", { environment: env })
    .select("id");
  if (settlementError || settled?.length !== 1) {
    throw new Error(`webhook_settlement_failed:${settlementError?.code ?? "missing claim"}`);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          // A misconfigured endpoint must fail loudly — never a fake success.
          console.error("[payments:webhook] invalid env", rawEnv);
          return new Response("Invalid or missing env query parameter", { status: 400 });
        }
        let event: StripeWebhookEvent;
        try {
          event = (await verifyWebhook(request, rawEnv)) as StripeWebhookEvent;
        } catch (error) {
          // Signature/parse failures: never retryable, never processed.
          console.error("[payments:webhook] error", (error as Error).message);
          return new Response("Webhook error", { status: 400 });
        }
        try {
          const claim = await claimEvent(event, rawEnv);
          if (claim.outcome === "duplicate")
            return Response.json({ received: true, duplicate: true });
          if (claim.outcome === "transient")
            return new Response("Temporarily unable to record webhook", { status: 503 });
          await finishClaimedWebhook({
            process: () => handleEvent(event, rawEnv),
            settle: () => associateEvent(claim.admin, claim.eventId, claim.organizationId, String(event.data?.object?.id ?? ""), rawEnv),
          });
          return Response.json({ received: true });
        } catch (error) {
          // An internal failure after a valid signature (database client,
          // claim bookkeeping) must be retried by Stripe, not dropped as a 400.
          console.error("[payments:webhook] internal error", (error as Error).message);
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
