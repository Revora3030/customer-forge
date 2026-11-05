import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCityModelEvidence } from "@/lib/ai-model-evidence.functions";
import { successLabel, type ModelEvidence as Evidence } from "@/lib/ai-model-evidence";
import { FAILURE_CAUSE_LABEL } from "@/lib/ai-city";

/** JC-22: recorded model performance for the Institute. Read-only; no model is called from here. */
export function ModelEvidence() {
  const load = useServerFn(getCityModelEvidence);
  const query = useQuery({ queryKey: ["admin-city-model-evidence"], queryFn: () => load(), refetchInterval: 300_000 });
  return <ModelEvidenceView data={query.data} loading={query.isLoading} failed={query.isError} />;
}

export function ModelEvidenceView({ data, loading, failed }: { data: Evidence | undefined; loading: boolean; failed: boolean }) {
  if (loading) return <p className="mt-2 text-xs text-muted-foreground">Loading model evidence…</p>;
  if (failed || !data || !data.used) return <p role="alert" className="mt-2 text-xs text-destructive">Model evidence unavailable. Recorded calls could not be read, so nothing is shown as working or failing.</p>;
  return (
    <div className="mt-2 space-y-3">
      {data.used.length ? (
        <ul className="space-y-2" aria-label="Models with recorded calls">
          {data.used.map((row) => (
            <li key={row.model} className="rounded-md border border-border p-2 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="break-all font-mono font-semibold">{row.model}</span><span>{successLabel(row)}</span></div>
              <p className="mt-1 text-muted-foreground">{row.provider ? `${row.provider} · ` : ""}{row.calls} call{row.calls === 1 ? "" : "s"} · {row.ok} succeeded · {row.failed} failed</p>
              {row.failuresByCause.length ? <p className="mt-1">Failed because: {row.failuresByCause.map((c) => `${FAILURE_CAUSE_LABEL[c.cause]} ${c.count}`).join(", ")}</p> : null}
              <p className="mt-1 text-muted-foreground">{row.lastSuccessAt ? `Last success ${new Date(row.lastSuccessAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET` : "No success recorded in this window"}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">No model calls were recorded in the last {data.windowDays} days.</p>}
      <section aria-label="Configured but not used">
        <h4 className="text-xs font-semibold">Configured, no recorded call</h4>
        {data.neverUsed === null ? <p className="mt-1 text-xs text-muted-foreground">Model list unavailable.</p>
          : data.neverUsed.length ? <ul className="mt-1 flex flex-wrap gap-1">{data.neverUsed.map((m) => <li key={m.model} className="break-all rounded-md border border-border px-2 py-1 font-mono text-[11px]">{m.label}</li>)}</ul>
          : <p className="mt-1 text-xs text-muted-foreground">Every configured model has a recorded call.</p>}
      </section>
      <p className="text-[11px] text-muted-foreground">
        Recorded calls from the last {data.windowDays} days only{data.capped ? "; the read stopped at its row limit, so the oldest calls are missing and these counts are a floor" : ""}.
        {data.unattributed ? ` ${data.unattributed} call${data.unattributed === 1 ? "" : "s"} had no model name and ${data.unattributed === 1 ? "is" : "are"} not counted above.` : ""} Read-only: no model is called from here.
      </p>
    </div>
  );
}
