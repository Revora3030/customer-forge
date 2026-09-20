/**
 * The free model collective, for the platform admin.
 *
 * Shows exactly which free models Revora can reach right now, what each one is
 * trusted with, and which models took part in the most recent website builds —
 * including the honest reason a model answered nothing. No credentials, prompts
 * or generated content are ever shown here.
 */

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Layers, Users } from "lucide-react";
import { EmptyState, ErrorNote, LoadingRows, MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { getAiModelInventory } from "@/lib/ai/health.functions";

const PROVIDER_LABEL: Record<string, string> = {
  cloudflare: "Cloudflare",
  groq: "Groq",
  nvidia: "NVIDIA",
  llm7: "LLM7",
  openrouter: "OpenRouter",
  google: "Google",
};

const label = (name: string) => PROVIDER_LABEL[name] ?? name;

const verdictTone = (verdict: string) =>
  verdict === "PASS" ? "signal" : verdict === "BLOCKED" ? "warning" : "danger";

export function FreeModelCollective() {
  const load = useServerFn(getAiModelInventory);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const inventory = useQuery({
    queryKey: ["admin-ai-inventory"],
    queryFn: () => load({}),
    refetchInterval: 120_000,
  });

  const data = inventory.data;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Free model collective"
        title="Every model working on your websites"
        description="Revora builds with the whole free model pool at once — a team of specialists rather than one model. Nothing here costs anything to run."
      />

      {inventory.error ? <ErrorNote message="Couldn't read the model inventory." /> : null}
      {inventory.isLoading ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Free models reachable" value={data.totals.models.toLocaleString("en-US")} hint="all verified free" />
            <MetricCard label="Providers" value={String(data.totals.providers)} hint="no paid accounts used" />
            <MetricCard label="Specialist roles" value={String(data.lanes.length)} hint="architect, designer, SEO, QA…" />
            <MetricCard
              label="Cost to run"
              value="$0"
              hint="paid models are refused"
              tone="signal"
            />
          </div>

          <Panel className="space-y-3">
            <SectionHeading title="By provider" description="Open a provider to see each model and what it is trusted with." />
            {data.byProvider.length === 0 ? (
              <EmptyState
                icon={<Layers className="size-5" />}
                title="No free model is reachable right now"
                description="The built-in website builder keeps working without AI — it simply builds without the extra opinions."
              />
            ) : (
              <div className="space-y-2">
                {data.byProvider.map((row) => {
                  const open = openProvider === row.provider;
                  const models = data.models.filter((entry) => entry.provider === row.provider);
                  return (
                    <div key={row.provider} className="rounded-lg border border-border bg-card/40">
                      <button
                        type="button"
                        onClick={() => setOpenProvider(open ? null : row.provider)}
                        aria-expanded={open}
                        className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-[13px]"
                      >
                        <span className="font-medium">{label(row.provider)}</span>
                        <span className="flex items-center gap-2">
                          <Pill tone={row.healthy ? "signal" : "warning"} dot>
                            {row.healthy ? "Answering" : "Resting"}
                          </Pill>
                          <span className="text-muted-foreground">{row.models} free models</span>
                        </span>
                      </button>
                      {open ? (
                        <ul className="space-y-1.5 border-t border-border p-3">
                          {models.map((entry) => (
                            <li key={entry.model} className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                                <span className="font-medium break-all">{entry.displayName}</span>
                                <Pill tone={entry.confidence === "live" ? "signal" : "neutral"}>
                                  {entry.confidence === "live" ? "Listed live" : "Configured"}
                                </Pill>
                                {entry.structuredOutput ? <Pill tone="neutral">Structured</Pill> : null}
                              </div>
                              <p className="text-[11.5px] text-muted-foreground">
                                Trusted with: {entry.capabilities.join(", ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel className="space-y-3">
            <SectionHeading
              title="Recent multi-model builds"
              description="Each build shows how many models took part, how many agreed, and why any model produced nothing."
            />
            {data.runs.length === 0 ? (
              <EmptyState
                icon={<Users className="size-5" />}
                title="No multi-model build yet on this server"
                description="Build or redesign a website and the full team run will appear here."
              />
            ) : (
              <div className="space-y-2">
                {data.runs.map((run) => (
                  <div
                    key={`${run.at}-${run.task}`}
                    className="space-y-2 rounded-lg border border-border bg-card/40 p-3 text-[12.5px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{run.task}</span>
                      <span className="flex items-center gap-2">
                        <Pill tone="neutral">{run.mode}</Pill>
                        <Pill tone={verdictTone(run.verdict)} dot>
                          {run.verdict.replace(/_/g, " ")}
                        </Pill>
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {run.distinctModels} models across {run.providers.length} provider
                      {run.providers.length === 1 ? "" : "s"} · {run.succeeded} answered,{" "}
                      {run.failed} did not · {run.agreement} agreed on the result (
                      {run.distinct} distinct proposal{run.distinct === 1 ? "" : "s"}) ·{" "}
                      {(run.totalLatencyMs / 1000).toFixed(1)}s
                      {run.deadlineHit ? " · time limit reached" : ""}
                    </p>
                    <details>
                      <summary className="cursor-pointer text-[11.5px] text-muted-foreground">
                        Model by model
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {run.participants.map((entry, index) => (
                          <li
                            key={`${entry.provider}-${entry.model}-${entry.lane}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]"
                          >
                            <span className="break-all">
                              {label(entry.provider)} · {entry.model}
                            </span>
                            <span className="text-muted-foreground">
                              {entry.lane} ·{" "}
                              {entry.ok ? "answered" : `no answer: ${entry.reason ?? "failed"}`}
                            </span>
                          </li>
                        ))}
                        {run.skipped.map((entry, index) => (
                          <li
                            key={`skip-${entry.provider}-${entry.model}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]"
                          >
                            <span className="break-all">
                              {label(entry.provider)} · {entry.model}
                            </span>
                            <span className="text-muted-foreground">
                              not used: {entry.reason}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
