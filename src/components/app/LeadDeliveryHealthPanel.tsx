import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill } from "@/components/app/Bits";
import { getLeadDeliveryHealth } from "@/lib/lead-delivery-watchdog.functions";
import { relative } from "@/lib/format";

/**
 * /admin: is every new lead's owner alert getting out, and is the watchdog
 * that checks it still running? "Accepted" means the email provider accepted
 * the message; the provider does not report inbox delivery or bounces.
 */
export function LeadDeliveryHealthPanel() {
  const load = useServerFn(getLeadDeliveryHealth);
  const query = useQuery({
    queryKey: ["admin", "lead-delivery-health"],
    queryFn: () => load({}),
    refetchInterval: 60_000,
  });
  const data = query.data;
  const openCount = data?.open.length ?? 0;

  return (
    <Panel data-testid="lead-delivery-health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <BellRing className="size-3.5" aria-hidden /> Lead alert delivery
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Checked every 5 minutes. A lead whose owner alert hasn&apos;t been accepted by the email
            provider after 5 minutes is retried, then flagged here and on the owner&apos;s dashboard.
          </p>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-1.5">
            <Pill tone={data.stale ? "danger" : "signal"} dot>
              {data.lastRunAt
                ? data.stale
                  ? `Watchdog silent since ${relative(data.lastRunAt)}`
                  : `Watchdog ran ${relative(data.lastRunAt)}`
                : "Watchdog has not run yet"}
            </Pill>
            <Pill tone={openCount ? "danger" : "signal"}>
              {openCount ? `${openCount} lead${openCount === 1 ? "" : "s"} without an alert` : "No open problems"}
            </Pill>
          </div>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="mt-3">
          <LoadingRows rows={2} />
        </div>
      ) : query.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          Couldn&apos;t load lead delivery health.
        </p>
      ) : data ? (
        <>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Last 24 hours: {data.last24h.flagged} flagged · {data.last24h.retrySent} fixed by retry ·{" "}
            {data.last24h.retryFailed} retries failed · {data.last24h.resolved} resolved
            {data.last24h.errors ? ` · ${data.last24h.errors} watchdog errors` : ""}
          </p>
          {openCount === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="Every recent lead has an accepted owner alert"
                description="Nothing is waiting on a retry or on an owner."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {data.open.map((item) => (
                <li key={item.leadId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
                  <div>
                    <p className="font-medium">{item.workspace}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {item.explanation}
                      {item.reason ? ` (${item.reason})` : ""} · {item.attempts} retr{item.attempts === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <span className="text-[12px] text-muted-foreground">flagged {relative(item.firstFlaggedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Panel>
  );
}
