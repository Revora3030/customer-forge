import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { ApprovalSafetySummary } from "@/components/app/jarvis/ApprovalSafety";
import { agentApprovalSafety } from "@/lib/jarvis/approval-safety";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { decideAgentApprovalFn, listAgentApprovalsFn } from "@/lib/agent/approvals.functions";
import type { ApprovalRow } from "@/lib/agent/approvals.server";
import { pendingApprovals, type ApprovalView } from "@/lib/agent/approvals-view";

/**
 * Things the AI agent wants to send outside the business, waiting for the owner's
 * tap (PAI-4). Hidden when nothing is waiting. Only the workspace owner sees the
 * buttons; everyone else sees what is waiting.
 */
export function AgentApprovalsPanel({
  organizationId,
  isOwner,
}: {
  organizationId: string;
  isOwner: boolean;
}) {
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const key = ["agent-approvals", organizationId] as const;
  const list = useQuery({
    queryKey: key,
    queryFn: () => listAgentApprovalsFn({ data: { organizationId } }),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
  const decide = useMutation({
    mutationFn: (input: { approvalId: string; approve: boolean }) =>
      decideAgentApprovalFn({ data: { organizationId, ...input } }),
    onSuccess: (result, input) => {
      setMessage(
        result.ok
          ? input.approve
            ? "Approved. The agent can now send it, once."
            : "Rejected. Nothing was sent."
          : result.message,
      );
      void client.invalidateQueries({ queryKey: key });
    },
    onError: () => setMessage("Couldn't save your answer. Nothing was sent. Try again."),
  });
  const items: ApprovalView[] = pendingApprovals(
    (list.data?.approvals ?? []) as unknown as ApprovalRow[],
  );
  // A failed read must not hide approvals that may be waiting: the agent is paused until they answer.
  if (list.isError && !list.data) {
    return (
      <QueryErrorNotice
        title="We couldn't check whether the agent is waiting for your approval."
        retry={() => list.refetch()}
        retrying={list.isFetching}
      />
    );
  }
  if (items.length === 0 && !message) return null;
  return (
    <section
      className="panel space-y-3 p-4"
      aria-label="Waiting for your approval"
      data-testid="agent-approvals"
    >
      <p className="eyebrow">Waiting for your approval</p>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <span className="text-xs text-muted-foreground">{item.expiresLabel}</span>
            </div>
            <p className="break-words text-sm">{item.summary}</p>
            <ApprovalSafetySummary safety={agentApprovalSafety(item.tool)} />
            {item.details.length > 0 ? (
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                  Exactly what will be sent
                </summary>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
                  {item.details.map((line) => (
                    <div key={line.label} className="contents">
                      <dt className="text-muted-foreground">{line.label}</dt>
                      <dd className="min-w-0 break-words">{line.value}</dd>
                    </div>
                  ))}
                </dl>
                {item.hiddenDetailCount > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    + {item.hiddenDetailCount} more details
                  </p>
                ) : null}
              </details>
            ) : null}
            {isOwner ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ approvalId: item.id, approve: false })}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <X className="size-4" /> Reject
                </button>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ approvalId: item.id, approve: true })}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="size-4" /> Approve
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only the workspace owner can approve this.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
