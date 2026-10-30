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
import { AiTeamTrace } from "@/components/app/AiTeamTrace";
import { TeamReviewLog } from "@/components/app/TeamReviewLog";
import { CatalogueModelsPanel } from "@/components/app/CatalogueModelsPanel";
import { getAiHealth } from "@/lib/ai/health.functions";
import { getLunaStatus } from "@/lib/ai/luna.functions";


export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({
    meta: [
      { title: "AI health — Revora admin" },
      { property: "og:title", content: "AI health — Revora admin" },
      { property: "og:description", content: "Lovable AI model routing, recorded usage and spending limits for Revora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "Lovable AI model routing, recorded usage and spending limits for Revora.",
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
    <div className="product-page">
      <SectionHeading
        title="Revora AI"
        description="Lovable AI is the only generation provider. Current routing and recorded usage are shown separately; credentials are never displayed."
      />

      {data && !data.configured ? (
        <Panel>
          <EmptyState
            icon={<ShieldAlert className="size-5" />}
            title="Lovable AI is not configured"
            description={data.unconfiguredMessage}
          />
        </Panel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Calls (24h)"
          value={data ? count(data.last24h.calls) : "—"}
          hint={`${count(data?.last24h.failures ?? 0)} failed`}
        />
        <MetricCard
          label="Calls (7d)"
          value={data ? count(data.window.calls) : "—"}
          hint={`${failureRate}% failed`}
        />
        <MetricCard
          label="Typical response"
          value={data && data.last24h.medianLatencyMs > 0 ? `${(data.last24h.medianLatencyMs / 1000).toFixed(1)}s` : "—"}
          hint={data && data.last24h.medianLatencyMs > 0 ? "Middle of the last 24 hours" : "No positive response time recorded"}
        />
        <MetricCard
          label="Estimated spend (7d)"
          value={money(data?.estimatedCostUsd ?? null)}
          hint="Recorded Lovable estimates; not your credit balance or provider invoice"
        />
      </div>

      <LunaPanel />

      <Panel>

        <SectionHeading
          title="Lovable AI team"
          description="Every AI job runs on Lovable AI models, best model first for each job. If Lovable AI is unavailable or the spending cap is reached, work waits — there is no backup provider."
        />
        {health.isLoading ? <LoadingRows /> : null}
        <div className="space-y-2">
          {(data?.lovable.roles ?? []).map((entry) => (
            <div key={entry.role} className="product-tile">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="signal">{entry.role}</Pill>
                <span className="text-muted-foreground">{entry.models.length} models</span>
              </div>
              <p className="mt-1.5 text-muted-foreground">{entry.models.join(" · ")}</p>
            </div>
          ))}
        </div>
        {data?.lovable.last ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Last request: <span className="font-medium">{data.lovable.last.model}</span> · {data.lovable.last.task} ·{" "}
            {data.lovable.last.ok
              ? "answered"
              : `failed (${data.lovable.last.category?.replace(/_/g, " ") ?? "unknown"})`}
            {data.lovable.last.fallbackUsed ? " · recorded model failover" : ""}
          </p>
        ) : null}
        {data ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {data.builderAiAvailable
              ? "Lovable AI is configured for the builder; configuration does not prove a new request will succeed. "
              : "AI is not configured for new builder work; no stock or deterministic design is substituted. "}
          </p>
        ) : null}

      </Panel>

      <Panel>
        <SectionHeading
          title="Generation provider"
          description="Lovable AI only. Model vendors shown in the catalogue are reached through Lovable, not separate free-provider accounts."
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
                  {provider.configured ? "Configured · not a live call test" : "Not configured"}
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

      <AiTeamTrace />

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

      <CatalogueModelsPanel catalogue={data?.catalogue} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHeading
            title="Recorded Lovable model usage (7 days)"
            description="Only Lovable calls appear here. Retired-provider records remain in the accounting history, never in active model controls."
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
              {data.window.fallbacks === 1 ? " has" : "s have"} recorded failover; this is not proof of successful delivery.
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

      <TeamReviewLog />


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
        description="All Lovable AI spending counts against this monthly cap. When it is reached, AI work waits until next month or until you raise the cap."
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
                    : "Enabled · subject to credits"}
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
                    {tier.enabled ? "Enabled" : "Off"}
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
                  <span className="min-w-0 break-words font-medium">{event.purpose.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{money(event.costUsd)}</span>
                  <span className="min-w-0 break-words text-muted-foreground">
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
