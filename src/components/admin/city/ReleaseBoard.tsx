import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCityReleaseBoard } from "@/lib/ai-city-panels.functions";
import { VERDICT_LABEL, errorGroupsLine, type ErrorGroupsInput, type ReleaseBoard as ReleaseBoardData } from "@/lib/ai-city-panels";

const TONE = { passed: "text-gold", failed: "text-destructive", running: "text-muted-foreground", missing: "text-muted-foreground", other_commit: "text-muted-foreground" } as const;

/**
 * JC-26: release and reliability evidence. Missing evidence is shown as
 * missing, never as a pass. Open error groups are the #562 groups the inspector
 * already computed; this board adds CI, isolation and contracts.
 */
export function ReleaseBoard({ errors }: { errors?: ErrorGroupsInput | undefined }) {
  const load = useServerFn(getCityReleaseBoard);
  const query = useQuery({ queryKey: ["admin-city-release-board"], queryFn: () => load(), refetchInterval: 120_000 });
  return <ReleaseBoardView data={query.data} loading={query.isLoading} failed={query.isError} errors={errors} />;
}

export function ReleaseBoardView({ data, loading, failed, errors }: { data: ReleaseBoardData | undefined; loading: boolean; failed: boolean; errors?: ErrorGroupsInput | undefined }) {
  const errorSummary = (
    <div className="rounded-md border border-border p-2 text-xs" aria-label="Open error groups">
      <p className="font-medium">{errorGroupsLine(errors)}</p>
      {errors?.groups.slice(0, 3).map((group) => <p key={group.key} className="mt-1 break-words text-muted-foreground">{group.count}× {group.label}</p>)}
    </div>
  );
  if (loading) return <div className="mt-2 space-y-3">{errorSummary}<p className="text-xs text-muted-foreground">Loading release evidence…</p></div>;
  if (failed || !data) return <div className="mt-2 space-y-3">{errorSummary}<p role="alert" className="text-xs text-destructive">Release evidence unavailable.</p></div>;
  return (
    <div className="mt-2 space-y-3">
      {errorSummary}
      <div>
        <p className="text-xs font-medium">
          CI for the current commit {data.ci.head ? <span className="font-mono">{data.ci.head.slice(0, 7)}</span> : "(unknown)"}
        </p>
        {data.ci.reason ? <p role="status" className="mt-1 text-xs text-muted-foreground">{data.ci.reason} Nothing below counts as a pass.</p> : null}
        <ul className="mt-1 space-y-1" aria-label="CI checks">
          {data.ci.checks.map((check) => (
            <li key={check.name} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
              <span className="min-w-0 break-words">{check.name}</span>
              <span className={`shrink-0 font-medium ${TONE[check.verdict]}`}>
                {check.url ? <a href={check.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline-offset-2 hover:underline">{VERDICT_LABEL[check.verdict]}</a> : VERDICT_LABEL[check.verdict]}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-md border border-border p-2 text-xs">
        <p className="font-medium">Tenant isolation test: {data.tenantIsolation.state === "not_recorded" ? "not recorded" : data.tenantIsolation.state}</p>
        <p className="text-muted-foreground">{data.tenantIsolation.detail}</p>
      </div>
      <div className="rounded-md border border-border p-2 text-xs">
        <p className="font-medium">
          Database contract probe: {!data.contracts.probed ? "not run (unreadable)" : data.contracts.failed ? `${data.contracts.failed} failed` : `${data.contracts.accepted} accepted`}
        </p>
        <p className="text-muted-foreground">
          {data.contracts.probed ? `Read-only probe just now${data.contracts.failedTables.length ? `; failed: ${data.contracts.failedTables.join(", ")}` : ""}. Not a migration or RLS audit.` : "No probe result is available."}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Read-only. A pass means completed successfully on this exact commit; CI is not proof of a live deploy.</p>
    </div>
  );
}
