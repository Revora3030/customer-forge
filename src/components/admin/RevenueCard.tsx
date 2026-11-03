import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Panel, SectionHeading, LoadingRows } from "@/components/app/Bits";
import { getRevenueCard } from "@/lib/revenue-card.functions";
import { mismatchCountsByWorkspace, type RevenueCardData } from "@/lib/revenue-card";

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Presentational and read-only: numbers in, text out. */
export function RevenueCardView({ data }: { data: RevenueCardData }) {
  const perWorkspace = mismatchCountsByWorkspace(data.mismatches);
  return (
    <>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Setup fees paid" value={String(data.setup.paidWorkspaces)} hint={`${data.setup.fullyDiscountedWorkspaces} fully discounted by promotion code`} />
        <Stat label="Setup fees collected" value={usd(data.setup.collectedCents)} hint={data.setup.refundedCents ? `${usd(data.setup.refundedCents)} refunded` : "no setup refunds"} />
        <Stat label="Active subscriptions" value={String(data.subscriptions.active)} hint={`${data.subscriptions.trialing} trialing · ${data.subscriptions.pastDue} past due`} />
        <Stat label="Records that disagree" value={String(data.mismatches.length)} hint={`across ${perWorkspace.length} of ${data.workspaces} workspaces`} />
      </dl>
      {data.mismatches.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">No disagreements between the workspace, payment and subscription records.</p>
      ) : (
        <ul className="mt-4 space-y-1.5 text-[13px]" aria-label="Records that disagree">
          {data.mismatches.map((m, i) => (
            <li key={`${m.workspace}-${m.kind}-${i}`} className="break-words">
              <span className="font-medium">{m.workspace}</span>: {m.detail}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-muted-foreground">
        Counted only from records our verified Stripe webhook saved (live mode, customer workspaces). This card never contacts Stripe.
        To compare the database with Stripe itself, run the read-only reconcile script.
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[22px] font-semibold tabular-nums">{value}</dd>
      <dd className="mt-0.5 text-[12px] text-muted-foreground">{hint}</dd>
    </div>
  );
}

export function RevenueCard({ enabled }: { enabled: boolean }) {
  const fetchCard = useServerFn(getRevenueCard);
  const query = useQuery({ queryKey: ["admin", "revenue-card"], queryFn: () => fetchCard({}), enabled, staleTime: 60_000 });
  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Revenue" title="Setup fees and subscriptions" />
      {query.isPending ? (
        <LoadingRows rows={2} />
      ) : query.isError ? (
        <p className="mt-4 text-[13px]">The revenue numbers couldn&apos;t be loaded just now, so nothing is shown. Refresh in a moment.</p>
      ) : (
        <RevenueCardView data={query.data} />
      )}
    </Panel>
  );
}
