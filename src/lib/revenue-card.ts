/**
 * Read-only revenue card numbers, counted ONLY from rows our verified Stripe
 * webhook wrote to the database (organizations.setup_*, payments, subscriptions).
 * It never talks to Stripe. Comparing the database with Stripe itself is the
 * separate read-only script (scripts/reconcile-billing.ts); this card only
 * shows the mismatches the database can prove on its own.
 */
import { dollarsToCents, isSetupPaymentRow, resolveSetupPaid, type PaymentRowLike } from "@/lib/billing-state";

export type RevenueOrg = {
  id: string;
  name?: string | null;
  is_demo?: boolean | null;
  setup_paid_at?: string | null;
  setup_payment_status?: string | null;
  subscription_status?: string | null;
};
export type RevenuePayment = PaymentRowLike & {
  organization_id: string;
  environment?: string | null;
  refunded_amount?: number | string | null;
};
export type RevenueSubscription = {
  organization_id: string;
  environment?: string | null;
  status: string;
  provider_subscription_id?: string | null;
};

export type RevenueMismatchKind =
  | "setup_witnesses_disagree"
  | "workspace_active_no_active_subscription"
  | "active_subscription_workspace_not_active"
  | "duplicate_active_subscriptions"
  | "active_subscription_without_stripe_id";

export type RevenueMismatch = { workspace: string; kind: RevenueMismatchKind; detail: string };

export type RevenueCardData = {
  workspaces: number;
  setup: {
    paidWorkspaces: number;
    fullyDiscountedWorkspaces: number;
    collectedCents: number;
    refundedCents: number;
  };
  subscriptions: { active: number; trialing: number; pastDue: number };
  mismatches: RevenueMismatch[];
};

export function buildRevenueCard(input: {
  orgs: RevenueOrg[];
  payments: RevenuePayment[];
  subscriptions: RevenueSubscription[];
}): RevenueCardData {
  const orgs = input.orgs.filter((o) => !o.is_demo);
  const ids = new Set(orgs.map((o) => o.id));
  const live = <T extends { environment?: string | null; organization_id: string }>(rows: T[]) =>
    rows.filter((r) => (r.environment ?? "live") === "live" && ids.has(r.organization_id));
  const payments = live(input.payments);
  const subs = live(input.subscriptions);

  const mismatches: RevenueMismatch[] = [];
  const name = (o: RevenueOrg) => o.name?.trim() || o.id.slice(0, 8);
  const setup = { paidWorkspaces: 0, fullyDiscountedWorkspaces: 0, collectedCents: 0, refundedCents: 0 };
  const sub = { active: 0, trialing: 0, pastDue: 0 };

  for (const org of orgs) {
    const mine = payments.filter((p) => p.organization_id === org.id);
    const resolved = resolveSetupPaid({ org, payments: mine });
    if (resolved.setupPaid) setup.paidWorkspaces += 1;
    if (resolved.setupPaid && resolved.setupFullyDiscounted) setup.fullyDiscountedWorkspaces += 1;
    for (const p of mine) {
      if (p.status === "completed" && isSetupPaymentRow(p)) {
        setup.collectedCents += dollarsToCents(p.amount);
        setup.refundedCents += dollarsToCents(p.refunded_amount);
      }
    }
    if (resolved.witnessesDisagree && resolved.setupPaid)
      mismatches.push({
        workspace: name(org),
        kind: "setup_witnesses_disagree",
        detail:
          resolved.source === "workspace"
            ? "workspace says setup paid, but there is no completed setup payment row"
            : "a completed setup payment row exists, but the workspace is not marked paid",
      });

    const mySubs = subs.filter((s) => s.organization_id === org.id);
    const active = mySubs.filter((s) => s.status === "active");
    if (active.length > 0) sub.active += 1;
    else if (mySubs.some((s) => s.status === "trialing")) sub.trialing += 1;
    else if (mySubs.some((s) => s.status === "past_due")) sub.pastDue += 1;

    if (active.length > 1)
      mismatches.push({ workspace: name(org), kind: "duplicate_active_subscriptions", detail: `${active.length} active subscription rows` });
    if (active.some((s) => !s.provider_subscription_id))
      mismatches.push({ workspace: name(org), kind: "active_subscription_without_stripe_id", detail: "active subscription row has no Stripe subscription id" });
    if (org.subscription_status === "active" && active.length === 0)
      mismatches.push({ workspace: name(org), kind: "workspace_active_no_active_subscription", detail: "workspace is marked active, but no active live subscription row exists" });
    if (org.subscription_status && org.subscription_status !== "active" && active.length > 0)
      mismatches.push({ workspace: name(org), kind: "active_subscription_workspace_not_active", detail: `subscription row is active, workspace says ${org.subscription_status}` });
  }
  return { workspaces: orgs.length, setup, subscriptions: sub, mismatches };
}

export function mismatchCountsByWorkspace(mismatches: RevenueMismatch[]): Array<{ workspace: string; count: number }> {
  const counts = new Map<string, number>();
  for (const m of mismatches) counts.set(m.workspace, (counts.get(m.workspace) ?? 0) + 1);
  return [...counts].map(([workspace, count]) => ({ workspace, count })).sort((a, b) => b.count - a.count || a.workspace.localeCompare(b.workspace));
}
