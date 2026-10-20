import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { listJarvisApprovalLogFn } from "@/lib/jarvis.functions";
import { approvalLabel } from "./approval-label";

/** What Jarvis did after the owner approved it, from the permanent audit record. */
export function ApprovalLogCard() {
  const list = useServerFn(listJarvisApprovalLogFn);
  const log = useQuery({ queryKey: ["jarvis", "approval-log"], queryFn: () => list(), staleTime: 60_000 });
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium">
        Approval log
        <span className="text-xs font-normal text-muted-foreground">{log.data ? `${log.data.length} recent` : ""}</span>
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        {log.isError ? (
          <QueryErrorNotice title="Couldn't load the approval log." retry={() => log.refetch()} retrying={log.isFetching} />
        ) : log.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : log.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing approved yet. Actions you approve for Jarvis are saved here permanently.</p>
        ) : (
          <ul className="divide-y divide-border">
            {log.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 text-foreground">{approvalLabel(row.action)}{row.entityId && row.entity !== "organization" ? ` · #${row.entityId.slice(0, 12)}` : ""}</span>
                <time className="text-xs text-muted-foreground" dateTime={row.at}>{new Date(row.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
