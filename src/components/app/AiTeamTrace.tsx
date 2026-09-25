import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { EmptyState, ErrorNote, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { getTeamTrace } from "@/lib/ai/team-trace.functions";

export function AiTeamTrace() {
  const load = useServerFn(getTeamTrace);
  const q = useQuery({ queryKey: ["admin-ai-team-trace"], queryFn: () => load({ data: {} }), refetchInterval: 60_000 });
  const reg = q.data?.registry;
  return (
    <Panel>
      <SectionHeading
        title="AI team, step by step"
        description={
          reg
            ? `${reg.tracked} models on record from ${reg.providers} providers · ${reg.probed} tested · ${reg.healthy} healthy · ${reg.retired} retired`
            : "Which model did which job in recent builds and edits."
        }
      />
      {q.isLoading ? <LoadingRows /> : null}
      {q.error ? <ErrorNote message={(q.error as Error).message} /> : null}
      {!q.isLoading && !q.data?.rows.length ? (
        <EmptyState icon={<Users className="size-5" />} title="No team steps yet" description="The next build or edit will show every model that took part here." />
      ) : null}
      <div className="space-y-2">
        {(q.data?.rows ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 product-tile">
            <span className="min-w-0">
              <span className="font-medium">{r.stage}</span>{" "}
              <span className="text-muted-foreground">
                · {r.model ? `${r.provider ? `${r.provider} · ` : ""}${r.model}` : "no model"}
              </span>
              {r.reason ? <span className="block text-xs text-muted-foreground">{r.reason}</span> : null}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Pill tone={r.ok ? "signal" : "danger"}>{r.ok ? "done" : "failed"}</Pill>
              {r.lane} · {r.latencyMs === null ? "—" : `${(r.latencyMs / 1000).toFixed(1)}s`}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
