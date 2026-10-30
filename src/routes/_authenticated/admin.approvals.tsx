import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { EmptyState, LoadingRows, SectionHeading } from "@/components/app/Bits";
import { AgentRequestCard } from "@/components/app/AgentRequestCard";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { decideAgentActionFn, listFounderApprovalsFn } from "@/lib/agent-actions.functions";
import type { ActionRequestView } from "@/lib/agent-gateway";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  validateSearch: (search: Record<string, unknown>): { request?: string } =>
    typeof search["request"] === "string" && /^[0-9a-f-]{36}$/i.test(search["request"]) ? { request: search["request"] } : {},
  head: () => ({
    meta: [
      { title: "Approvals — Revora admin" },
      { name: "description", content: "Approve or reject what your bots are asking to do." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminApprovals,
});

function AdminApprovals() {
  const { request: focusId } = Route.useSearch();
  const listFn = useServerFn(listFounderApprovalsFn);
  const decideFn = useServerFn(decideAgentActionFn);
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  // One quick retry, not the default three with backoff: a failing load must
  // reach the error notice in seconds instead of sitting on loading rows.
  const query = useQuery({ queryKey: ["admin", "approvals"], queryFn: () => listFn(), refetchInterval: 30_000, retry: 1, retryDelay: 1_000 });

  useEffect(() => {
    if (!focusId || !query.data) return;
    document.getElementById(`request-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, query.data]);

  const decide = async (item: ActionRequestView, approve: boolean) => {
    setBusyId(item.id);
    try {
      const result = await decideFn({ data: { id: item.id, approve } });
      if (result.ok) toast.success(approve ? "Approved. The bot can do this one action now." : "Rejected. The bot won't do it.");
      else toast.error(result.message);
    } catch (error) {
      toast.error(friendlyError(error as Error));
    } finally {
      setBusyId(null);
      void qc.invalidateQueries({ queryKey: ["admin", "approvals"] });
    }
  };

  const requests = query.data?.requests ?? [];
  const waiting = requests.filter((item) => item.state === "pending");
  const history = requests.filter((item) => item.state !== "pending");

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-24">
      <SectionHeading
        eyebrow="Founder sign-off"
        title="Approvals"
        description="Your bots ask here before they merge, deploy, publish, send, charge or delete. Each approval allows one action, once."
      />
      {query.data ? (
        <div className="grid grid-cols-2 gap-2">
          <Link to="/admin/jarvis" className="panel flex min-h-16 flex-col justify-center p-3 text-sm">
            <span className="text-lg font-semibold">{query.data.jarvisWaiting ?? "—"}</span>
            <span className="text-muted-foreground">Jarvis proposals</span>
          </Link>
          <Link to="/admin/jarvis" className="panel flex min-h-16 flex-col justify-center p-3 text-sm">
            <span className="text-lg font-semibold">{query.data.leadsWaiting ?? "—"}</span>
            <span className="text-muted-foreground">Leads to review</span>
          </Link>
        </div>
      ) : null}
      {query.isError ? (
        <QueryErrorNotice title="Couldn't load approvals." retry={() => query.refetch()} retrying={query.isFetching} />
      ) : query.isPending ? (
        <LoadingRows rows={3} />
      ) : query.data?.queueError ? (
        <QueryErrorNotice title={query.data.queueError} retry={() => query.refetch()} retrying={query.isFetching} />
      ) : waiting.length === 0 ? (
        <EmptyState title="Nothing waiting" description="When a bot needs your sign-off it shows up here, and it waits until you decide." />
      ) : (
        <div className="space-y-3">
          {waiting.map((item) => (
            <AgentRequestCard key={item.id} item={item} focused={item.id === focusId} busy={busyId === item.id} onDecide={(approve) => void decide(item, approve)} />
          ))}
        </div>
      )}
      {history.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">History ({history.length})</summary>
          <div className="space-y-3 pt-2">
            {history.map((item) => (
              <AgentRequestCard key={item.id} item={item} focused={item.id === focusId} busy={false} onDecide={() => undefined} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
