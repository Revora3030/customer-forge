import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { UNKNOWN_STATE, funnelStates, type EngineFunnel } from "@/lib/engine-funnel";
import { getEngineFunnelFn } from "@/lib/prospect-autopilot.functions";

const KEY = ["jarvis", "engine-funnel"] as const;

const shown = (value: number | null) => (value === null ? "Unknown" : value.toLocaleString());

/**
 * "Engine today": the prospect engine funnel from discovered to converted, in
 * total and for today (UTC), with a per-state breakdown. Read-only; a stage
 * whose source couldn't be read says Unknown, never zero.
 */
export function EngineTodayCard() {
  const getFunnel = useServerFn(getEngineFunnelFn);
  const funnel = useQuery<EngineFunnel>({ queryKey: KEY, queryFn: () => getFunnel(), staleTime: 60_000 });
  const data = funnel.data;
  const states = data ? funnelStates(data) : [];

  return (
    <section aria-labelledby="engine-today-title" className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="engine-today-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Activity className="size-4" aria-hidden />Engine today
        </h3>
        <Button type="button" size="sm" variant="outline" data-jarvis-tap="" disabled={funnel.isFetching} onClick={() => { void funnel.refetch(); }}>
          {funnel.isFetching ? "Checking…" : "Refresh"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Prospect demos from discovery to a paid workspace. Each business counts once per stage; “today” is the current UTC day{data ? ` (${data.day})` : ""}.
      </p>

      {funnel.error && !data ? (
        <QueryErrorNotice title="Couldn't load the engine funnel." retry={() => funnel.refetch()} retrying={funnel.isFetching} />
      ) : !data ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">Loading…</p>
      ) : (
        <>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.stages.map((stage) => (
              <li key={stage.key} className="min-w-0 rounded-md border border-border p-2">
                <p className="truncate text-xs text-muted-foreground">{stage.label}</p>
                <p className="text-lg font-semibold tabular-nums">{shown(stage.total)}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{stage.today === null ? "today unknown" : `+${stage.today.toLocaleString()} today`}</p>
              </li>
            ))}
          </ol>
          {data.unavailable.length ? (
            <p className="text-xs text-muted-foreground">
              Unknown (source not readable yet): {data.unavailable.map((key) => data.stages.find((stage) => stage.key === key)?.label ?? key).join(", ")}.
            </p>
          ) : null}
          {states.length ? (
            <details className="rounded-md border border-border p-2">
              <summary className="min-h-11 cursor-pointer content-center text-xs">By state ({states.length})</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-xs tabular-nums">
                  <caption className="sr-only">Funnel totals by state, with today's count in parentheses</caption>
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th scope="col" className="py-1 pr-2 font-medium">State</th>
                      {data.stages.map((stage) => (
                        <th key={stage.key} scope="col" className="py-1 pr-2 font-medium">{stage.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((state) => (
                      <tr key={state} className="border-t border-border">
                        <th scope="row" className="py-1 pr-2 text-left font-medium">{state === UNKNOWN_STATE ? "Unknown" : state}</th>
                        {data.stages.map((stage) => {
                          const count = stage.byState[state];
                          return (
                            <td key={stage.key} className="py-1 pr-2">
                              {stage.total === null ? "–" : `${count?.total ?? 0}${count?.today ? ` (+${count.today})` : ""}`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
