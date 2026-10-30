import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import type { AiHealth } from "@/lib/ai/health.functions";

/** Super-admin view: every live catalogue model, its app route and real last-24h telemetry. */
export function CatalogueModelsPanel({ catalogue }: { catalogue: AiHealth["catalogue"] | undefined }) {
  if (!catalogue) return null;
  const when = catalogue.fetchedAt ? new Date(catalogue.fetchedAt).toLocaleString() : null;
  return (
    <Panel>
      <SectionHeading
        title="Live model catalogue"
        description={
          catalogue.state === "unavailable"
            ? `Couldn't read the live catalogue: ${catalogue.error ?? "unknown error"}. Routing uses the saved model lists until it can.`
            : `${catalogue.models.length} models from the live catalogue${when ? `, read ${when}` : ""}${catalogue.state === "stale" ? " (saved copy; latest refresh failed)" : ""}. Numbers are the last 24 hours of recorded calls.`
        }
      />
      {catalogue.staleRosterIds.length ? (
        <div className="mb-3 space-y-1 text-[12px] text-destructive">
          {catalogue.staleRosterIds.map((entry) => (
            <p key={`${entry.role}:${entry.id}`}>
              Skipped in {entry.role}: {entry.id} — {entry.reason}
            </p>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Model</th>
              <th className="py-1 pr-3 font-medium">Used for</th>
              <th className="py-1 pr-3 font-medium">Calls</th>
              <th className="py-1 pr-3 font-medium">Succeeded / failed calls</th>
              <th className="py-1 pr-3 font-medium">Median time</th>
              <th className="py-1 pr-3 font-medium">Est. cost</th>
              <th className="py-1 font-medium">Last used / why not</th>
            </tr>
          </thead>
          <tbody>
            {catalogue.models.map((model) => (
              <tr key={model.id} className="border-t border-border align-top">
                <td className="py-1.5 pr-3 font-medium">{model.id}</td>
                <td className="py-1.5 pr-3">
                  {model.roles.length ? model.roles.join(", ") : <Pill tone="neutral">{catalogue.state === "unavailable" ? "unverified" : "not routed"}</Pill>}
                </td>
                <td className="py-1.5 pr-3">{model.last24h.attempts}</td>
                <td className="py-1.5 pr-3">
                  {model.last24h.successes} / {model.last24h.failures}
                </td>
                <td className="py-1.5 pr-3">{model.last24h.medianLatencyMs === null ? "—" : `${(model.last24h.medianLatencyMs / 1000).toFixed(1)}s`}</td>
                <td className="py-1.5 pr-3">{model.last24h.estimatedCostUsd === null ? "—" : `$${model.last24h.estimatedCostUsd.toFixed(4)}`}</td>
                <td className="py-1.5 text-muted-foreground">
                  {model.last24h.lastUsedAt ? `${new Date(model.last24h.lastUsedAt).toLocaleString()}${model.reason ? ` · ${model.reason}` : ""}` : model.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
