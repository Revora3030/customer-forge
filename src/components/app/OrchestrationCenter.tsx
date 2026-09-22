/**
 * Model orchestration visibility, for the platform admin.
 *
 * Deliberately separates "discovered", "proven", "healthy" and "actually used".
 * The catalogue size is never presented as a capability claim.
 */

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Cpu, Route as RouteIcon } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { getAiOrchestration } from "@/lib/ai/health.functions";

const count = (value: number) => value.toLocaleString("en-US");

export function OrchestrationCenter() {
  const load = useServerFn(getAiOrchestration);
  const query = useQuery({
    queryKey: ["admin-ai-orchestration"],
    queryFn: () => load({}),
    refetchInterval: 120_000,
  });
  const data = query.data;

  return (
    <Panel>
      <SectionHeading
        title="Model orchestration"
        description="Work is given to the most capable model that fits the job. Cost is only ever used to break a tie between models that are otherwise equal."
      />
      {query.isLoading ? <LoadingRows /> : null}
      {query.error ? <ErrorNote message="Could not read the model catalogue." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label="Found in catalogues"
              value={count(data.totals.discovered)}
              hint="Listed by a provider — not a capability claim"
            />
            <MetricCard
              label="Capabilities proven"
              value={count(data.totals.verified)}
              hint="Checked with a real request"
            />
            <MetricCard
              label="Reachable now"
              value={count(data.totals.healthy)}
              hint="In budget and not resting"
            />
            <MetricCard
              label="Lead models"
              value={`${count(data.totals.specialistsHealthy)}/${count(data.totals.specialists)}`}
              hint="The six that own their jobs"
            />
            <MetricCard
              label="Actually used"
              value={count(data.totals.participated)}
              hint="Took part in recent work"
            />
          </div>

          <div className="mt-4 space-y-2">
            {data.specialists.map((entry) => (
              <div
                key={`${entry.provider}:${entry.model}`}
                className="rounded-lg border border-border bg-card/40 p-3 text-[13px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={entry.healthy ? "signal" : "attention"}>
                    {entry.healthy ? "Leading" : (entry.blockedReason ?? "Unavailable")}
                  </Pill>
                  <span className="font-medium">{entry.displayName}</span>
                  <span className="text-muted-foreground">quality {entry.quality}</span>
                </div>
                {entry.charter ? (
                  <p className="mt-1.5 text-muted-foreground">{entry.charter}</p>
                ) : null}
                {entry.proven.length ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Proven: {entry.proven.map((item) => item.replace(/_/g, " ")).join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {data.decisions.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-[13px] font-medium">Recent routing decisions</p>
              {data.decisions.map((decision) => (
                <div
                  key={decision.requestId}
                  className="rounded-lg border border-border bg-card/40 p-3 text-[13px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={decision.unmetCapabilities.length ? "attention" : "signal"}>
                      {decision.confidence} confidence
                    </Pill>
                    <span className="font-medium">{decision.task.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">
                      {new Date(decision.at).toLocaleTimeString("en-US")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-muted-foreground">
                    {decision.participants
                      .map((entry) => `${entry.model} — ${entry.job}: ${entry.reason}`)
                      .join(" · ")}
                  </p>
                  {decision.rejected.length ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Skipped:{" "}
                      {decision.rejected
                        .slice(0, 6)
                        .map((entry) => `${entry.model} (${entry.reason})`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {decision.unmetCapabilities.length ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Nothing available for:{" "}
                      {decision.unmetCapabilities.map((item) => item.replace(/_/g, " ")).join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={<RouteIcon className="size-5" />}
                title="No routing decisions recorded yet"
                description="Each decision, and the reason every model was chosen or skipped, appears here after the next AI-assisted build."
              />
            </div>
          )}

          {data.participation.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-[13px] font-medium">Which models actually did the work</p>
              {data.participation.map((entry) => (
                <div
                  key={`${entry.provider}:${entry.model}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 p-3 text-[13px]"
                >
                  <span>
                    <span className="font-medium capitalize">{entry.provider}</span>{" "}
                    <span className="text-muted-foreground">{entry.model}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {entry.roles.map((role) => role.replace(/_/g, " ")).join(", ")} ·{" "}
                    {count(entry.calls)} calls · {count(entry.failures)} failed
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {data.models.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-[13px] font-medium">
                Catalogue sample ({count(data.modelsShown)} of {count(data.totals.discovered)})
              </p>
              {data.models.slice(0, 25).map((entry) => (
                <div
                  key={`${entry.provider}:${entry.model}`}
                  className="rounded-lg border border-border bg-card/40 p-3 text-[13px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={entry.healthy && !entry.blockedReason ? "signal" : "attention"}>
                      {entry.blockedReason ?? (entry.healthy ? "Reachable" : "Resting")}
                    </Pill>
                    <span className="font-medium">{entry.model}</span>
                    <span className="text-muted-foreground capitalize">{entry.provider}</span>
                    <span className="text-muted-foreground">
                      {entry.evidence === "probe" ? "checked" : "provider listing only"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Proven:{" "}
                    {entry.proven.length
                      ? entry.proven.map((item) => item.replace(/_/g, " ")).join(", ")
                      : "nothing yet"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={<Cpu className="size-5" />}
                title="No provider catalogue answered"
                description="Nothing outside the lead models is reachable right now, so only they can be used."
              />
            </div>
          )}


          <div className="mt-6">
            <SectionHeading
              title="Free stand-in squads"
              description="When the paid lead models are out of budget or unavailable, the job is handed to these free models in this order. Every member has passed a real capability check for that job."
            />
            <div className="mt-2 space-y-2">
              {data.hallOfFame.squads.map((squad) => (
                <div
                  key={squad.purpose}
                  className="rounded-lg border border-border bg-card/40 p-3 text-[13px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={squad.members.some((m) => m.ready) ? "signal" : "attention"}>
                      {squad.members.filter((m) => m.ready).length} ready
                    </Pill>
                    <span className="font-medium">{squad.purpose.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{squad.capability}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {squad.members.length
                      ? squad.members
                          .map((m) => `${m.model}${m.ready ? "" : " (resting)"}`)
                          .join(" → ")
                      : "No free model has proven this job yet."}
                  </p>
                </div>
              ))}
            </div>
            {data.hallOfFame.runs.length ? (
              <div className="mt-3 space-y-1">
                {data.hallOfFame.runs.map((run, index) => (
                  <p
                    key={`${run.at}-${index}`}
                    className="text-[12px] text-muted-foreground"
                  >
                    {run.purpose.replace(/_/g, " ")} —{" "}
                    {run.answeredBy
                      ? `carried by ${run.answeredBy}`
                      : "no free model could carry it"}
                    {run.paidReason ? ` (paid lane: ${run.paidReason})` : ""}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-muted-foreground">
                The paid lead models have handled everything so far — no hand-over yet.
              </p>
            )}
          </div>

          <p className="mt-3 text-[12px] text-muted-foreground">
            A model outside the six is only ever brought in when a real check proves it can do
            something for the exact job that the six cannot.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
