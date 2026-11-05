import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { NOT_VERIFIED, formatGate, type GateScoreboard as Board, type SiteScore } from "@/lib/builder/quality/gate-scoreboard";
import { getGateScoreboard } from "@/lib/builder/quality/gate-scoreboard.functions";

const VERDICT: Record<SiteScore["verdict"], { label: string; tone: string }> = {
  passed: { label: "Meets bar", tone: "text-success" },
  below_bar: { label: "Below bar", tone: "text-destructive" },
  [NOT_VERIFIED]: { label: NOT_VERIFIED, tone: "text-muted-foreground" },
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "—");

/** JC-21: stored gate scores per recent site. Every number comes from a saved row; anything unmeasured says NOT_VERIFIED. */
export function GateScoreboardView({ board, error, loading }: { board: Board | undefined; error?: boolean; loading?: boolean }) {
  if (error) return <p role="alert" className="mt-2 text-xs text-destructive">Gate scores unavailable. Every site counts as {NOT_VERIFIED}.</p>;
  if (loading || !board) return <p role="status" className="mt-2 text-xs text-muted-foreground">Loading recorded gate scores…</p>;
  if (!board.sitesAvailable) return <p role="alert" className="mt-2 text-xs text-destructive">Recent sites could not be read.</p>;
  if (!board.sites.length) return <p className="mt-2 text-xs text-muted-foreground">No site builds in the last 14 days.</p>;
  const { passed, belowBar, notVerified } = board.measured;
  return <>
    {!board.logAvailable ? <p role="alert" className="mt-2 text-xs text-gold">Quality log not readable yet (migration 20261031190000 may not be applied). All sites show {NOT_VERIFIED}.</p> : null}
    <p className="mt-2 text-[11px] text-muted-foreground">{passed} meet bar · {belowBar} below bar · {notVerified} {NOT_VERIFIED} (N={board.sites.length} sites)</p>
    <ul className="mt-2 space-y-1.5">
      {board.sites.map((s) => {
        const v = VERDICT[s.verdict];
        return <li key={s.organizationId} className="rounded-md border border-border p-2 text-xs">
          <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{s.name ?? <span className="font-mono">{s.organizationId.slice(0, 8)}</span>}</span><span className={`shrink-0 font-semibold ${v.tone}`}>{v.label}</span></div>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
            <div><dt className="inline">Build gate: </dt><dd className="inline">{formatGate(s.build)}{s.build ? ` · ${day(s.build.at)}` : ""}</dd></div>
            <div><dt className="inline">Publish check: </dt><dd className="inline">{formatGate(s.publish)}{s.publish ? ` · ${day(s.publish.at)}${s.publish.mode ? ` · ${s.publish.mode}` : ""}` : ""}</dd></div>
          </dl>
          {s.failing.length ? <p className="mt-1 break-words text-[11px] text-muted-foreground">Failing: <span className="font-mono">{s.failing.join(", ")}</span></p> : null}
        </li>;
      })}
    </ul>
    <p className="mt-2 text-[11px] text-muted-foreground">Scores are copied from saved runVideoGate and publish_check rows. {NOT_VERIFIED} means no score was recorded; it is never estimated.</p>
  </>;
}

export function GateScoreboard({ enabled }: { enabled: boolean }) {
  const load = useServerFn(getGateScoreboard);
  const q = useQuery({ queryKey: ["admin-city-gate-scoreboard"], queryFn: () => load(), enabled, refetchInterval: enabled ? 60_000 : false });
  return <section className="mt-5" aria-label="Quality-gate scoreboard"><h3 className="text-xs font-semibold uppercase">Quality-gate scoreboard</h3><GateScoreboardView board={q.data} error={q.isError} loading={q.isLoading} /></section>;
}
