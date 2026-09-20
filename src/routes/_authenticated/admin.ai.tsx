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
import { getAiHealth } from "@/lib/ai/health.functions";

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
              className="rounded-lg border border-border bg-card/40 p-3 text-[13px]"
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
              className="rounded-lg border border-border bg-card/40 p-3 text-[13px]"
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 p-3 text-[13px]"
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 p-3 text-[13px]"
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
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/40 p-3 text-[13px]"
              >
                <span className="font-medium">{entry.category.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{count(entry.count)}</span>
              </div>
            ))}
            {(data?.refusedToolCalls ?? []).map((entry) => (
              <div
                key={`${entry.tool}:${entry.reason}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/40 p-3 text-[13px]"
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
    </div>
  );
}
