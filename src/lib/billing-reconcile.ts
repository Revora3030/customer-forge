/**
 * Read-only billing reconciliation: compares each workspace's billing state in
 * the database with what Stripe says. Pure functions over plain JSON exports,
 * so it never writes to either system (Stripe stays read-only).
 */
import { resolveSetupPaid, dollarsToCents, isSetupPaymentRow, type PaymentRowLike } from "@/lib/billing-state";

export type DbOrg = {
  id: string;
  name?: string | null;
  is_demo?: boolean | null;
  setup_paid_at?: string | null;
  setup_payment_status?: string | null;
};
export type DbSubscription = {
  organization_id: string;
  environment?: string | null;
  status: string;
  provider_subscription_id?: string | null;
};
export type DbPayment = PaymentRowLike & { organization_id: string; environment?: string | null };
export type StripeSession = {
  id: string;
  mode?: string;
  status?: string; // open | complete | expired
  payment_status?: string; // paid | unpaid | no_payment_required
  amount_total?: number | null;
  subscription?: string | null;
  metadata?: Record<string, string> | null;
};
export type StripeSubscription = { id: string; status: string; metadata?: Record<string, string> | null };

export type MismatchKind =
  | "stripe_paid_db_unpaid"
  | "db_paid_no_stripe_payment"
  | "setup_witnesses_disagree"
  | "setup_amount_mismatch"
  | "subscription_status_mismatch"
  | "subscription_missing_in_db"
  | "subscription_missing_in_stripe";

export type Mismatch = { organizationId: string; workspace: string; kind: MismatchKind; detail: string };

export type ReconcileInput = {
  orgs: DbOrg[];
  subscriptions: DbSubscription[];
  payments: DbPayment[];
  stripeSessions: StripeSession[];
  stripeSubscriptions: StripeSubscription[];
  /** Only live rows are compared with the live Stripe account. */
  environment?: "live" | "sandbox";
};

const sessionOrg = (s: StripeSession) => s.metadata?.["organizationId"] ?? null;
const sessionPaid = (s: StripeSession) =>
  s.status === "complete" && (s.payment_status === "paid" || s.payment_status === "no_payment_required");

export function reconcileBilling(input: ReconcileInput): { mismatches: Mismatch[]; checked: number } {
  const env = input.environment ?? "live";
  const out: Mismatch[] = [];
  const orgName = new Map(input.orgs.map((o) => [o.id, o.name ?? o.id.slice(0, 8)]));
  const add = (organizationId: string, kind: MismatchKind, detail: string) =>
    out.push({ organizationId, workspace: orgName.get(organizationId) ?? organizationId.slice(0, 8), kind, detail });

  const paidSessionsByOrg = new Map<string, StripeSession[]>();
  for (const s of input.stripeSessions) {
    const id = sessionOrg(s);
    if (id && sessionPaid(s)) paidSessionsByOrg.set(id, [...(paidSessionsByOrg.get(id) ?? []), s]);
  }
  const stripeSubById = new Map(input.stripeSubscriptions.map((s) => [s.id, s]));

  for (const org of input.orgs) {
    const payments = input.payments.filter((p) => p.organization_id === org.id && (p.environment ?? "live") === env);
    const resolved = resolveSetupPaid({ org, payments });
    const paidSessions = paidSessionsByOrg.get(org.id) ?? [];

    if (resolved.witnessesDisagree && resolved.setupPaid)
      add(org.id, "setup_witnesses_disagree", `workspace columns say ${resolved.source === "workspace" ? "paid, no setup payment row" : "unpaid, but a completed setup payment row exists"}`);
    if (paidSessions.length > 0 && !resolved.setupPaid)
      add(org.id, "stripe_paid_db_unpaid", `Stripe has ${paidSessions.length} completed checkout(s); database says setup unpaid`);
    if (resolved.setupPaid && paidSessions.length === 0 && !org.is_demo)
      add(org.id, "db_paid_no_stripe_payment", "database says setup paid but Stripe has no completed checkout for this workspace");

    const setupRows = payments.filter((p) => p.status === "completed" && isSetupPaymentRow(p));
    if (setupRows.length === 1 && paidSessions.length === 1 && paidSessions[0]!.amount_total != null) {
      const db = dollarsToCents(setupRows[0]!.amount);
      if (db !== paidSessions[0]!.amount_total)
        add(org.id, "setup_amount_mismatch", `database setup payment ${db} cents vs Stripe checkout total ${paidSessions[0]!.amount_total} cents`);
    }

    const dbSub = input.subscriptions
      .filter((s) => s.organization_id === org.id && (s.environment ?? "live") === env)
      .at(-1);
    const stripeIds = new Set(paidSessions.map((s) => s.subscription).filter(Boolean) as string[]);
    if (dbSub?.provider_subscription_id) {
      const st = stripeSubById.get(dbSub.provider_subscription_id);
      if (!st) add(org.id, "subscription_missing_in_stripe", `database subscription (${dbSub.status}) not found in Stripe export`);
      else if (st.status !== dbSub.status)
        add(org.id, "subscription_status_mismatch", `database ${dbSub.status} vs Stripe ${st.status}`);
    } else if (stripeIds.size > 0) {
      const live = [...stripeIds].map((id) => stripeSubById.get(id)).filter(Boolean);
      add(org.id, "subscription_missing_in_db", `Stripe has subscription ${live[0]?.status ?? "(not exported)"}; database has none`);
    }
  }
  return { mismatches: out, checked: input.orgs.length };
}

export function summarizeByWorkspace(result: { mismatches: Mismatch[] }): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of result.mismatches) counts[m.workspace] = (counts[m.workspace] ?? 0) + 1;
  return counts;
}
