import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { LoadingRows, Pill } from "@/components/app/Bits";
import { getLeadDeliveryAudit } from "@/lib/lead-delivery-audit.functions";
import { AUDIT_KIND_COPY } from "@/lib/lead-delivery-audit";
import { relative } from "@/lib/format";

/**
 * Inside the /admin "Lead alert delivery" panel: did every recent accepted form
 * reach the right workspace and the right recipient? Reads stored delivery rows
 * only. A wrong workspace or wrong recipient is critical; a missing or failed
 * delivery is high. The runtime watchdog's own flags are shown above it.
 */
export function LeadRoutingAudit() {
  const load = useServerFn(getLeadDeliveryAudit);
  const query = useQuery({
    queryKey: ["admin", "lead-routing-audit"],
    queryFn: () => load({}),
    refetchInterval: 5 * 60_000,
  });
  const data = query.data;
  const bad = data ? data.counts.critical + data.counts.high + data.counts.medium : 0;

  return (
    <div className="mt-5 border-t border-border pt-4" data-testid="lead-routing-audit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Routing check</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last 72 hours of real leads, read from the stored delivery rows: right workspace, right
            recipient, delivered. Nothing is sent to read this.
          </p>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-1.5">
            <Pill tone={data.counts.critical ? "danger" : "signal"} dot>
              {data.counts.critical
                ? `${data.counts.critical} wrong workspace or recipient`
                : "Every lead routed to its own workspace and recipient"}
            </Pill>
            {data.counts.high + data.counts.medium ? (
              <Pill tone="attention">{data.counts.high + data.counts.medium} other to review</Pill>
            ) : null}
            {data.webhookSkipped ? <Pill tone="neutral">Webhook routing not checked</Pill> : null}
          </div>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="mt-3">
          <LoadingRows rows={2} />
        </div>
      ) : query.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          Couldn&apos;t run the routing check.
        </p>
      ) : data ? (
        <>
          <p className="mt-3 text-[12px] text-muted-foreground">
            {data.leadsChecked} lead{data.leadsChecked === 1 ? "" : "s"} · {data.alertRowsChecked} alert row
            {data.alertRowsChecked === 1 ? "" : "s"}
            {data.webhookRowsChecked === null ? "" : ` · ${data.webhookRowsChecked} webhook row${data.webhookRowsChecked === 1 ? "" : "s"}`}
            {" "}· checked {relative(data.checkedAt)}
            {data.leadsChecked === 0 ? " · no real leads in this window, so nothing was verified" : ""}
          </p>
          {bad > 0 ? (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border" data-testid="lead-routing-findings">
              {data.findings.map((f, i) => (
                <li key={`${f.leadId}-${f.kind}-${i}`} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {f.workspace} <Pill tone={f.severity === "critical" ? "danger" : "attention"}>{f.severity}</Pill>
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {AUDIT_KIND_COPY[f.kind]}. {f.detail}
                      {f.watchdogOpen ? " The watchdog is already retrying or flagging it." : ""}
                    </p>
                  </div>
                  <span className="text-[12px] text-muted-foreground">lead from {relative(f.leadCreatedAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {data.truncated ? (
            <p className="mt-2 text-[12px] text-muted-foreground">Showing the first 50 of {bad} findings.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
