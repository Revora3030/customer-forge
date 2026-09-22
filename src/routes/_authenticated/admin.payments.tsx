import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Receipt } from "lucide-react";
import {
  EmptyState,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAllPayments, usePaymentEvents } from "@/lib/payments.hooks";
import { refundPayment } from "@/lib/payments.functions";
import { useWorkspace } from "@/lib/use-tenant";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Revora admin" },
      {
        name: "description",
        content: "Verified Stripe transactions across every Revora client workspace.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPayments,
});

const money = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

const STATUS_TONE = (status: string) =>
  status === "completed"
    ? "signal"
    : status === "failed" || status === "disputed"
      ? "danger"
      : "neutral";

function AdminPayments() {
  const { data: ws } = useWorkspace();
  const isSuperAdmin = !!ws?.isSuperAdmin;
  const { data: payments, isLoading } = useAllPayments(isSuperAdmin);
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const runRefund = useServerFn(refundPayment);
  const queryClient = useQueryClient();
  const { data: events } = usePaymentEvents(openId);

  const rows = useMemo(() => payments ?? [], [payments]);
  const stats = useMemo(() => {
    const completed = rows.filter((p) => p.status === "completed");
    const gross = completed.reduce((s, p) => s + Number(p.amount), 0);
    const refunded = rows.reduce((s, p) => s + Number(p.refunded_amount ?? 0), 0);
    const failed = rows.filter((p) => p.status === "failed").length;
    return { gross, refunded, net: gross - refunded, count: completed.length, failed };
  }, [rows]);

  if (!isSuperAdmin) {
    return (
      <p className="text-[13px] text-muted-foreground">
        This area is limited to Revora platform administrators.
      </p>
    );
  }

  const open = rows.find((p) => p.id === openId) ?? null;

  const submitRefund = async () => {
    if (!open) return;
    setMessage(null);
    const value = amount.trim() ? Number(amount) : null;
    const result = await runRefund({
      data: value === null ? { paymentId: open.id } : { paymentId: open.id, amount: value },
    });
    if (result.ok) {
      setMessage(`Stripe confirmed the refund. Payment is now ${result.status.replace("_", " ")}.`);
      setAmount("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["payments", "all"] });
    } else {
      setMessage(result.error);
    }
  };

  return (
    <div className="product-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Payments</p>
          <h1 className="mt-1 font-display text-[24px] font-semibold">Verified transactions</h1>
        </div>
        <Pill tone="neutral">Stripe</Pill>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard
          label="Gross collected"
          value={money(stats.gross)}
          hint={`${stats.count} confirmed`}
          tone="signal"
        />
        <MetricCard label="Refunded" value={money(stats.refunded)} />
        <MetricCard label="Net revenue" value={money(stats.net)} />
        <MetricCard
          label="Failed attempts"
          value={String(stats.failed)}
          tone={stats.failed ? "attention" : "neutral"}
        />
      </div>

      <Panel className="p-5">
        <SectionHeading eyebrow="Ledger" title="All payments" />
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Receipt className="size-5" />}
              title="No payments recorded yet."
              description="Confirmed Stripe transactions from any client workspace will appear here."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Client</th>
                  <th className="pb-2 pr-3">Service</th>
                  <th className="pb-2 pr-3">Amount</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Env</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => {
                  const orgName =
                    (payment as { organizations?: { name?: string | null } | null }).organizations
                      ?.name ?? "—";
                  return (
                    <tr key={payment.id} className="border-t border-border">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {new Date(payment.completed_at ?? payment.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 pr-3">{orgName}</td>
                      <td className="py-2.5 pr-3">
                        {payment.description ?? payment.product_id ?? "Revora service"}
                      </td>
                      <td className="tnum py-2.5 pr-3">
                        {money(Number(payment.amount), payment.currency)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Pill tone={STATUS_TONE(payment.status)}>
                          {payment.status.replace("_", " ")}
                        </Pill>
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] uppercase text-muted-foreground">
                        {payment.environment}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOpenId(payment.id === openId ? null : payment.id);
                            setMessage(null);
                          }}
                        >
                          {payment.id === openId ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open ? (
        <Panel className="p-5">
          <SectionHeading eyebrow="Transaction" title={open.description ?? "Payment detail"} />
          <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Environment</dt>
              <dd className="font-mono text-[11px]">{open.environment}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Customer email</dt>
              <dd>{open.customer_email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Refunded</dt>
              <dd className="tnum">{money(Number(open.refunded_amount ?? 0), open.currency)}</dd>
            </div>
          </dl>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[13px] font-medium">Webhook events</p>
            {events && events.length ? (
              <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
                {events.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-2">
                    <span className="font-mono text-[11px]">{event.event_type}</span>
                    <span>· {event.verification_status}</span>
                    <span>· {event.processed ? "processed" : "received"}</span>
                    <span>· {new Date(event.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                No verified webhook events for this payment yet.
              </p>
            )}
          </div>

          {open.status === "completed" || open.status === "partially_refunded" ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[13px] font-medium">Issue refund through Stripe</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Leave the amount blank for a full refund. The status shown afterwards comes from
                Stripe.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={`Amount (max ${Number(open.amount) - Number(open.refunded_amount ?? 0)})`}
                  className="max-w-[200px]"
                  inputMode="decimal"
                />
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Reason (optional)"
                  className="max-w-[280px]"
                />
                <Button variant="outline" size="sm" onClick={() => void submitRefund()}>
                  Refund
                </Button>
              </div>
            </div>
          ) : null}

          {message ? (
            <p className="mt-3 flex items-start gap-2 text-[12px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 text-accent" /> {message}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
