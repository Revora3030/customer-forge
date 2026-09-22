import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Cpu, ShieldAlert, Sparkles } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { CapabilityCenter } from "@/components/app/CapabilityCenter";
import { FreeModelCollective } from "@/components/app/FreeModelCollective";
import { OrchestrationCenter } from "@/components/app/OrchestrationCenter";
import { getAiHealth } from "@/lib/ai/health.functions";
import { getLunaStatus } from "@/lib/ai/luna.functions";


export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({
    meta: [
      { title: "AI health — Revora admin" },
      {
        name: "description",
        content: "Which AI providers Revora owns, how they are performing, and what they cost.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAi,
});

const money = (value: number | null) =>
  value === null ? "—" : `$${value.toFixed(value < 1 ? 4 : 2)}`;

const count = (value: number) => value.toLocaleString("en-US");

function AdminAi() {
  const load = useServerFn(getAiHealth);
  const health = useQuery({
    queryKey: ["admin-ai-health"],
    queryFn: () => load({}),
    refetchInterval: 60_000,
  });

  const data = health.data;
  const failureRate =
    data && data.window.calls > 0
      ? Math.round((data.window.failures / data.window.calls) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Revora AI"
        description="Revora runs on its own AI provider accounts. Everything below is measured from the last 7 days of real calls — no prompts or generated content are ever stored."
      />

      {data && !data.configured ? (
        <Panel>
          <EmptyState
            icon={<ShieldAlert className="size-5" />}
            title="No AI provider is configured"
            description={`Every AI feature currently answers with: “${data.unconfiguredMessage}” Add a Revora provider key to switch AI back on. The built-in website builder and request reader keep working without it.`}
          />
        </Panel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Calls (24h)"
          value={count(data?.last24h.calls ?? 0)}
          hint={`${count(data?.last24h.failures ?? 0)} failed`}
        />
        <MetricCard
          label="Calls (7d)"
          value={count(data?.window.calls ?? 0)}
          hint={`${failureRate}% failed`}
        />
        <MetricCard
          label="Typical response"
          value={data ? `${(data.last24h.medianLatencyMs / 1000).toFixed(1)}s` : "—"}
          hint="Middle of the last 24 hours"
        />
        <MetricCard
          label="Estimated spend (7d)"
          value={money(data?.estimatedCostUsd ?? null)}
          hint="Estimate from token counts — providers bill on their own accounting"
        />
      </div>

      <LunaPanel />

      <Panel>

        <SectionHeading
          title="Free AI"
          description="Revora tries these free providers first, in this order. A provider is only usable when its own credentials are set, and only models that provider currently serves for free are ever chosen."
        />
        {health.isLoading ? <LoadingRows /> : null}
        <div className="space-y-2">
          {(data?.free.providers ?? []).map((provider) => (
            <div
              key={provider.name}
              className="product-tile"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill
                  tone={
                    !provider.configured ? "attention" : provider.healthy ? "signal" : "attention"
                  }
                >
                  {!provider.configured
                    ? "Not set up"
                    : provider.healthy
                      ? "Free · ready"
                      : "Paused briefly"}
                </Pill>
                <span className="font-medium">{provider.label}</span>
                {provider.remainingToday !== null ? (
                  <span className="text-muted-foreground">
                    {provider.remainingToday} requests left today
                  </span>
                ) : null}
                {provider.cooldownUntil ? (
                  <span className="text-muted-foreground">
                    resting until {new Date(provider.cooldownUntil).toLocaleTimeString("en-US")}
                  </span>
                ) : provider.openFailures > 0 ? (
                  <span className="text-muted-foreground">
                    {provider.openFailures} recent problem
                    {provider.openFailures === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-muted-foreground">{provider.allowance}</p>
              {provider.models.length ? (
                <p className="mt-1 text-muted-foreground">
                  {provider.models.map((entry) => `${entry.role}: ${entry.model}`).join(" · ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {data?.free.last ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Last request: <span className="font-medium capitalize">{data.free.last.provider}</span>{" "}
            {data.free.last.model} · {data.free.last.task} ·{" "}
            {data.free.last.ok
              ? "answered"
              : `failed (${data.free.last.category?.replace(/_/g, " ") ?? "unknown"})`}
            {data.free.last.fallbackUsed ? " · a backup provider covered it" : ""}
            {data.free.last.free ? " · free" : ""}
          </p>
        ) : null}
        {data ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {data.builderAiAvailable
              ? "Free AI is reachable, so the builder can use it. "
              : "No free AI is reachable, so the builder runs on Revora's own engine — nothing is blocked. "}
            {data.free.paidFallbackReachable
              ? "A paid provider has been explicitly switched on as a backup."
              : "Paid providers are switched off and cannot be reached."}
          </p>
        ) : null}

      </Panel>

      <Panel>
        <SectionHeading
          title="Paid providers"
          description="Only reachable when an operator explicitly turns off free-only mode. Nothing here is required to run the builder."
        />
        {health.isLoading ? <LoadingRows /> : null}
        {health.error ? <ErrorNote message={(health.error as Error).message} /> : null}
        <div className="space-y-2">
          {(data?.providers ?? []).map((provider) => (
            <div
              key={provider.name}
              className="product-tile"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={provider.configured ? "signal" : "attention"}>
                  {provider.configured ? `Ready · #${provider.order}` : "No key"}
                </Pill>
                <span className="font-medium capitalize">{provider.name}</span>
              </div>
              {provider.models.length ? (
                <p className="mt-1.5 text-muted-foreground">
                  {provider.models.map((entry) => `${entry.role}: ${entry.model}`).join(" · ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Where AI is being used"
          description="Each job Revora asks a model to do, busiest first."
        />
        {!health.isLoading && !data?.byTask.length ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="No AI calls yet"
            description="As soon as a customer uses the builder, writes a site or records a voice note, it appears here."
          />
        ) : null}
        <div className="space-y-2">
          {(data?.byTask ?? []).map((task) => (
            <div
              key={task.task}
              className="flex flex-wrap items-center justify-between gap-2 product-tile"
            >
              <span className="font-medium">{task.task}</span>
              <span className="text-muted-foreground">
                {count(task.calls)} calls · {count(task.failures)} failed ·{" "}
                {(task.p95LatencyMs / 1000).toFixed(1)}s slowest typical ·{" "}
                {money(task.estimatedCostUsd)}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHeading
            title="Models actually serving"
            description="Includes calls a backup provider had to cover."
          />
          {!health.isLoading && !data?.byModel.length ? (
            <EmptyState
              icon={<Cpu className="size-5" />}
              title="Nothing recorded yet"
              description="Model usage appears here after the first AI call."
            />
          ) : null}
          <div className="space-y-2">
            {(data?.byModel ?? []).map((model) => (
              <div
                key={`${model.provider}:${model.model}`}
                className="flex flex-wrap items-center justify-between gap-2 product-tile"
              >
                <span>
                  <span className="font-medium capitalize">{model.provider}</span>{" "}
                  <span className="text-muted-foreground">{model.model}</span>
                </span>
                <span className="text-muted-foreground">
                  {count(model.calls)} calls · {count(model.failures)} failed
                </span>
              </div>
            ))}
          </div>
          {data?.window.fallbacks ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              {count(data.window.fallbacks)} call
              {data.window.fallbacks === 1 ? " was" : "s were"} covered by the backup provider.
            </p>
          ) : null}
        </Panel>

        <Panel>
          <SectionHeading
            title="Problems and refusals"
            description="Why calls failed, and every action the AI was stopped from taking."
          />
          <div className="space-y-2">
            {(data?.errorsByCategory ?? []).map((entry) => (
              <div
                key={entry.category}
                className="flex items-center justify-between gap-2 product-tile"
              >
                <span className="font-medium">{entry.category.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{count(entry.count)}</span>
              </div>
            ))}
            {(data?.refusedToolCalls ?? []).map((entry) => (
              <div
                key={`${entry.tool}:${entry.reason}`}
                className="flex flex-wrap items-center justify-between gap-2 product-tile"
              >
                <span className="font-medium">{entry.tool}</span>
                <span className="text-muted-foreground">
                  stopped: {entry.reason.replace(/_/g, " ")} · {count(entry.count)}
                </span>
              </div>
            ))}
            {!health.isLoading &&
            !data?.errorsByCategory.length &&
            !data?.refusedToolCalls.length ? (
              <EmptyState
                icon={<ShieldAlert className="size-5" />}
                title="Nothing failed or was refused"
                description="No AI failures and no blocked actions in the last 7 days."
              />
            ) : null}
          </div>
        </Panel>
      </div>

      <OrchestrationCenter />

      <FreeModelCollective />

      <CapabilityCenter />
    </div>
  );
}

/**
 * The paid master planner's own panel: whether it is switched on, how much of
 * this month's hard cap is used, and what happened on its recent calls. No key,
 * prompt or generated content is shown here.
 */
function LunaPanel() {
  const load = useServerFn(getLunaStatus);
  const status = useQuery({
    queryKey: ["admin-luna-status"],
    queryFn: () => load({}),
    refetchInterval: 60_000,
  });
  const data = status.data;

  return (
    <Panel>
      <SectionHeading
        title="Master planner (paid)"
        description="One paid model coordinates the free workforce. It never builds a website itself, and it stops for the month the moment this cap is reached — websites keep building on the free engine either way."
      />
      {status.isLoading ? <LoadingRows /> : null}
      {status.error ? <ErrorNote message="Could not read the master planner's spending." /> : null}
      {data ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill tone={data.enabled && !data.blocked ? "signal" : "attention"}>
              {!data.keyPresent
                ? "No key set"
                : !data.enabled
                  ? "Switched off"
                  : data.blocked
                    ? "Paused — cap reached"
                    : "Active"}
            </Pill>
            <span className="text-[13px] text-muted-foreground">{data.model}</span>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {(data.tiers ?? []).map((tier) => (
              <div
                key={tier.tier}
                className="product-tile"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">{tier.tier}</span>
                  <Pill tone={tier.enabled ? "signal" : "attention"}>
                    {tier.enabled ? "Available" : "Off"}
                  </Pill>
                </div>
                <p className="mt-1 text-muted-foreground">{tier.model}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {tier.tier === "sol"
                    ? "Hardest thinking: strategy, layout, reviews"
                    : tier.tier === "terra"
                      ? "Second opinions, page and search planning"
                      : "Small, repetitive work"}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Monthly cap" value={money(data.capUsd)} hint={data.month} />
            <MetricCard label="Used" value={money(data.spentUsd)} hint="This calendar month" />
            <MetricCard label="Remaining" value={money(data.remainingUsd)} hint="No auto top-up" />
            <MetricCard label="Calls" value={count(data.calls)} hint="This calendar month" />
          </div>
          <div className="mt-3 space-y-2">
            {data.events.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="size-5" />}
                title="No coordination calls yet"
                description="Nothing has been spent this month."
              />
            ) : (
              data.events.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center gap-2 product-tile"
                >
                  <Pill tone={event.outcome === "succeeded" ? "signal" : "attention"}>
                    {event.outcome}
                  </Pill>
                  <span className="font-medium">{event.purpose.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{money(event.costUsd)}</span>
                  <span className="text-muted-foreground">
                    {count(event.inputTokens)} in · {count(event.cachedInputTokens)} reused ·{" "}
                    {count(event.outputTokens)} out
                  </span>
                  {event.reason ? (
                    <span className="text-muted-foreground">{event.reason}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </Panel>
  );
}
