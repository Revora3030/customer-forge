import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, HelpCircle, Wrench } from "lucide-react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import {
  CAPABILITY_STATUS_LABELS,
  type CapabilityStatus,
} from "@/lib/integrations/capabilities";
import { getIntegrationCenter } from "@/lib/integrations/capabilities.functions";

const icons: Record<CapabilityStatus, typeof CheckCircle2> = {
  ready: CheckCircle2,
  deterministic: Wrench,
  needs_connection: HelpCircle,
  unavailable: CircleSlash,
};

const tones: Record<CapabilityStatus, string> = {
  ready: "text-emerald-400",
  deterministic: "text-sky-400",
  needs_connection: "text-amber-400",
  unavailable: "text-muted-foreground",
};

const when = (at: number | null) => (at ? new Date(at).toLocaleString() : "never");

/**
 * Connection Center — what each builder capability can actually do right now.
 * Every line is derived from configured credentials and real call history; no
 * secret value is ever shown.
 */
export function CapabilityCenter() {
  const load = useServerFn(getIntegrationCenter);
  const query = useQuery({
    queryKey: ["integration_center"],
    queryFn: () => load(),
    staleTime: 30_000,
  });

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Revora"
        title="Connection Center"
        description="What the builder can use right now, which service serves it, and what is still waiting on a connection."
      />

      {query.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking connections…</p>
      ) : query.isError || !query.data ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Connection status couldn't be read just now.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            {query.data.summary.ready} ready · {query.data.summary.deterministic} on Revora's own
            engine · {query.data.summary.needsConnection} awaiting connection ·{" "}
            {query.data.summary.unavailable} not available
            {query.data.freeOnly ? " · free-only mode is on, so paid services stay blocked" : ""}
          </p>

          <ul className="mt-4 space-y-2">
            {query.data.capabilities.map((entry) => {
              const Icon = icons[entry.status];
              return (
                <li key={entry.capability} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tones[entry.status]}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {entry.label}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          — {CAPABILITY_STATUS_LABELS[entry.status]}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.detail}</p>
                      {entry.providers.some((provider) => provider.missing.length > 0) ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Missing settings:{" "}
                          {entry.providers
                            .filter((provider) => provider.missing.length > 0)
                            .map((provider) => `${provider.label} (${provider.missing.join(", ")})`)
                            .join("; ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3">Service</th>
                  <th className="py-1 pr-3">State</th>
                  <th className="py-1 pr-3">Cost</th>
                  <th className="py-1 pr-3">Verified live</th>
                  <th className="py-1 pr-3">Last success</th>
                  <th className="py-1 pr-3">Last problem</th>
                </tr>
              </thead>
              <tbody>
                {query.data.providers.map((provider) => (
                  <tr key={provider.id} className="border-t border-border/40">
                    <td className="py-1 pr-3">{provider.label}</td>
                    <td className="py-1 pr-3">
                      {provider.status === "ready"
                        ? provider.healthy
                          ? "Ready"
                          : "Resting after failures"
                        : provider.status === "needs_connection"
                          ? "Needs connection"
                          : "Not implemented"}
                    </td>
                    <td className="py-1 pr-3">{provider.cost}</td>
                    <td className="py-1 pr-3">{provider.runtimeVerified ? "yes" : "no"}</td>
                    <td className="py-1 pr-3">{when(provider.lastSuccessAt)}</td>
                    <td className="py-1 pr-3">{provider.lastFailureReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
