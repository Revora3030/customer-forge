import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { listJarvisApprovalsFn, rejectJarvisApprovalFn } from "@/lib/jarvis.functions";

const STATE_LABEL: Record<string, string> = {
  pending: "Waiting for you",
  failed: "Failed — can retry",
  claimed: "Running",
  done: "Done",
  rejected: "Dismissed",
  expired: "Expired",
};

/**
 * Every proposal Jarvis made, across conversations and devices, waiting ones
 * first. Approve from the chat message itself; dismiss here.
 */
export function ApprovalsCard() {
  const list = useServerFn(listJarvisApprovalsFn);
  const reject = useServerFn(rejectJarvisApprovalFn);
  const qc = useQueryClient();
  const approvals = useQuery({ queryKey: ["jarvis", "approvals"], queryFn: () => list(), staleTime: 30_000 });
  const items = approvals.data?.items ?? [];
  const waiting = items.filter((item) => item.state === "pending" || item.state === "failed").length;
  const dismiss = async (key: string) => {
    try {
      const result = await reject({ data: { key } });
      toast[result.rejected ? "success" : "error"](result.rejected ? "Dismissed. Jarvis won't run it." : "That proposal already ran or expired.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't dismiss that proposal.");
    }
    void qc.invalidateQueries({ queryKey: ["jarvis", "approvals"] });
  };
  return (
    <details className="rounded-xl border border-border bg-card" open={waiting > 0 || undefined}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium">
        Approvals
        <span className="text-xs font-normal text-muted-foreground">{approvals.data ? (waiting ? `${waiting} waiting` : "none waiting") : ""}</span>
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        {approvals.isError ? (
          <QueryErrorNotice title="Couldn't load approvals." retry={() => approvals.refetch()} retrying={approvals.isFetching} />
        ) : approvals.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proposals yet. When Jarvis suggests an action, it waits here until you approve it in the chat. Approvals last 24 hours and run once.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 break-words text-foreground">{item.summary || item.action_id}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {item.result_url ? <a className="underline" href={item.result_url} target="_blank" rel="noreferrer">Open</a> : null}
                  <span>{STATE_LABEL[item.state] ?? item.state}</span>
                  {item.state === "pending" || item.state === "failed" ? (
                    <button type="button" className="min-h-9 rounded-md border border-border px-2 text-foreground hover:bg-muted" onClick={() => { void dismiss(item.approval_key); }}>
                      Dismiss
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
