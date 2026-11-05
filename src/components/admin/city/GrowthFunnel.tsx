import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCityGrowthFunnel } from "@/lib/ai-city-panels.functions";
import { countLabel, type GrowthFunnel as GrowthFunnelData } from "@/lib/ai-city-panels";

/**
 * JC-25: the recorded acquisition funnel for the Growth district. Read-only:
 * "—" means the number could not be read, never zero.
 */
export function GrowthFunnel() {
  const load = useServerFn(getCityGrowthFunnel);
  const query = useQuery({ queryKey: ["admin-city-growth-funnel"], queryFn: () => load(), refetchInterval: 120_000 });
  return <GrowthFunnelView data={query.data} loading={query.isLoading} failed={query.isError} />;
}

export function GrowthFunnelView({ data, loading, failed }: { data: GrowthFunnelData | undefined; loading: boolean; failed: boolean }) {
  if (loading) return <p className="mt-2 text-xs text-muted-foreground">Loading the funnel…</p>;
  if (failed || !data) return <p role="alert" className="mt-2 text-xs text-destructive">Funnel unavailable.</p>;
  return (
    <div className="mt-2 space-y-3">
      {data.windows.map((window) => (
        <div key={window.days} aria-label={`Last ${window.days} days`}>
          <p className="text-xs font-medium">Last {window.days} days</p>
          {window.available ? (
            <ol className="mt-1 grid grid-cols-4 gap-1">
              {window.steps.map((step) => (
                <li key={step.key} className="min-w-0 rounded-md border border-border p-2 text-center">
                  <p className="break-words font-display text-sm font-semibold">{countLabel(step.count)}</p>
                  <p className="text-xs leading-tight text-muted-foreground">{step.label}{step.key === "paid" ? " (all time)" : ""}</p>
                  {step.rate !== null && step.key !== "visitors" ? <p className="text-xs text-muted-foreground">{step.rate}%</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Funnel not recorded or unreadable for this window.</p>
          )}
        </div>
      ))}
      <ul className="grid grid-cols-2 gap-2 text-center" aria-label="Prospects and drafts">
        <Tile label="Prospect replies" value={data.inbox.total} />
        <Tile label="Replies to review" value={data.inbox.needsReview} />
        <Tile label="Demos found" value={data.demos.found} />
        <Tile label="Demos ready" value={data.demos.ready} />
        <Tile label="Approvals waiting" value={data.waiting.approvals} />
        <Tile label="Unprocessed replies" value={data.inbox.unprocessed} />
      </ul>
      <p className="text-xs text-muted-foreground">
        Read-only. "—" means the record could not be read, not zero. Visitors are browser-measured, a minimum. Paid is all-time, so its rate is of this period's trials. Nothing is sent from here: drafts wait in the approvals below.
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="rounded-md border border-border p-2">
      <p className="font-display text-lg font-semibold">{countLabel(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </li>
  );
}
