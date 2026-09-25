import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorNote, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { getTeamReviews } from "@/lib/ai/health.functions";

const LABEL: Record<string, string> = {
  first_build_compositions: "First build",
  redesign_team_review: "Redesign",
  edit_team_review: "Chat edit",
};

export function TeamReviewLog() {
  const load = useServerFn(getTeamReviews);
  const query = useQuery({ queryKey: ["admin-team-reviews"], queryFn: () => load(), refetchInterval: 120_000 });
  const rows = (query.data ?? []).filter((row) => row.accepted + row.kept > 0);
  return (
    <Panel>
      <SectionHeading
        title="Team reviews"
        description="Every customer build, redesign and chat edit is reviewed by the team. Terra keeps a revision only when it scores higher and loses nothing on facts, accessibility or phone layout."
      />
      {query.isLoading ? <LoadingRows /> : null}
      {query.error ? <ErrorNote message="Could not read team reviews." /> : null}
      {query.data && !rows.length ? <EmptyState title="No team reviews yet" description="They appear after the next build, redesign or chat edit." /> : null}
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-border bg-card/40 p-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{row.business}</span>
              <Pill tone="neutral">{LABEL[row.kind] ?? row.kind}</Pill>
              {row.accepted ? <Pill tone="signal">{row.accepted} improved</Pill> : null}
              {row.kept ? <Pill tone="attention">{row.kept} kept stronger version</Pill> : null}
              <span className="ml-auto text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
            </div>
            {row.lastReason ? <p className="mt-1 text-muted-foreground">{row.lastReason}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}
