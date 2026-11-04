import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorNote, LoadingRows, MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { getBuilderRequestHealth } from "@/lib/build-monitoring.functions";

const secs = (v: number | null | undefined) =>
  v == null ? "—" : v < 90 ? `${v}s` : `${Math.round(v / 60)}m`;

const label = { changed: "Changed", answered: "Answered", failed: "Failed", no_reply: "No reply" } as const;
const tone = { changed: "signal", answered: "info", failed: "danger", no_reply: "attention" } as const;

/** Super-admin view of builder chat requests over the last 7 days. */
export function BuilderRequestHealthPanel() {
  const load = useServerFn(getBuilderRequestHealth);
  const q = useQuery({ queryKey: ["admin-builder-request-health"], queryFn: () => load({}), refetchInterval: 60_000 });
  const s = q.data;
  return (
    <Panel>
      <SectionHeading
        title="Builder chat requests (7 days)"
        description="How each chat request went, how long it took, and the most common reasons requests failed."
      />
      {q.isLoading ? <LoadingRows /> : null}
      {q.error ? <ErrorNote message={(q.error as Error).message} /> : null}
      {s && s.total === 0 ? <EmptyState title="No builder requests in the last 7 days" description="Requests appear here after an owner asks the builder for something." /> : null}
      {s && s.total > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricCard label="Success" value={s.successRate == null ? "—" : `${s.successRate}%`} hint={`${s.total} requests`} />
            <MetricCard label="Median time" value={secs(s.medianSeconds)} hint={`slowest ${secs(s.slowestSeconds)}`} />
            <MetricCard label="Changed / answered" value={`${s.changed} / ${s.answered}`} />
            <MetricCard label="Failed / no reply" value={`${s.failed} / ${s.noReply}`} />
          </div>
          {s.topReasons.length ? (
            <div className="product-tile mt-3 text-sm">
              <p className="font-medium">Top failure reasons</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {s.topReasons.map((r) => (
                  <li key={r.reason}>{r.count}× {r.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {s.recent.map((t) => (
              <div key={t.requestId} className="product-tile text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={tone[t.outcome]}>{label[t.outcome]}</Pill>
                  <span className="text-muted-foreground">
                    {new Date(t.startedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {secs(t.totalSeconds)}
                  </span>
                </div>
                {t.reason ? <p className="mt-1 text-muted-foreground">Reason: {t.reason}</p> : null}
                {t.stages.length ? (
                  <p className="mt-1 text-muted-foreground">
                    {t.stages.map((st) => `${st.stage} ${secs(st.seconds)}`).join(" → ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  );
}
