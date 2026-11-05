import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import {
  getJarvisHistory,
  listJarvisApprovalsFn,
  rejectJarvisApprovalFn,
} from "@/lib/jarvis.functions";
import type { WriteProposal } from "@/lib/jarvis-actions";
import {
  inboxEntries,
  proposalIndex,
  type InboxEntry,
} from "@/lib/jarvis/approvals-inbox";
import { APPROVALS_QUERY_KEY } from "./ApprovalsInbox";
import { ApprovalsQueue } from "./ApprovalsQueue";

type Props = {
  /**
   * When set, Approve (and bulk approve) run this path — same as the chat card.
   * When omitted, Approve points the owner to Jarvis chat instead.
   */
  onApprove?: ((key: string, proposal: WriteProposal) => void) | undefined;
};

/**
 * JC-55: Jarvis waiting approvals for `/admin/approvals`, sharing ApprovalsQueue
 * with the chat inbox. Reject uses rejectJarvisApprovalFn; approve uses the
 * chat path when provided, otherwise sends the owner to Jarvis.
 */
export function JarvisApprovalsSection({ onApprove }: Props) {
  const list = useServerFn(listJarvisApprovalsFn);
  const reject = useServerFn(rejectJarvisApprovalFn);
  const historyFn = useServerFn(getJarvisHistory);
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const approvals = useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: () => list(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const history = useQuery({
    queryKey: ["jarvis", "history", "approvals-page"],
    queryFn: () => historyFn({ data: {} }),
    staleTime: 30_000,
  });

  const proposals = useMemo(
    () => proposalIndex(history.data ?? []),
    [history.data],
  );
  const entries = useMemo(
    () => inboxEntries(approvals.data?.items ?? [], proposals),
    [approvals.data, proposals],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: ["admin", "approvals"] });
  };

  const rejectOne = async (entry: InboxEntry) => {
    setPending(entry.key);
    try {
      const result = await reject({ data: { key: entry.key } });
      toast[result.rejected ? "success" : "error"](
        result.rejected
          ? "Rejected. Jarvis won't run it."
          : "That proposal already ran or expired.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't reject that proposal.");
    } finally {
      setPending(null);
      invalidate();
    }
  };

  const bulkReject = async (items: InboxEntry[]) => {
    setBulkBusy(true);
    let rejected = 0;
    try {
      for (const entry of items) {
        try {
          const result = await reject({ data: { key: entry.key } });
          if (result.rejected) rejected += 1;
        } catch {
          /* continue */
        }
      }
      toast.success(
        rejected
          ? `Rejected ${rejected} proposal${rejected === 1 ? "" : "s"}. Jarvis won't run them.`
          : "Nothing was rejected — they may have already run or expired.",
      );
    } finally {
      setBulkBusy(false);
      invalidate();
    }
  };

  const handleApprove = (entry: InboxEntry) => {
    if (onApprove && entry.proposal) {
      onApprove(entry.key, entry.proposal);
      return;
    }
    toast.message("Open Jarvis to approve this — the chat runs the action after you approve.");
  };

  const handleBulkApprove = (items: InboxEntry[]) => {
    if (!onApprove) return;
    for (const entry of items) {
      if (!entry.proposal) continue;
      onApprove(entry.key, entry.proposal);
    }
  };

  if (approvals.isError) {
    return (
      <QueryErrorNotice
        title="Couldn't load Jarvis approvals."
        retry={() => approvals.refetch()}
        retrying={approvals.isFetching}
      />
    );
  }
  if (approvals.isPending) {
    return <p className="text-sm text-muted-foreground">Loading Jarvis approvals…</p>;
  }
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Jarvis proposals waiting.{" "}
        <Link to="/admin/jarvis" className="underline">
          Open Jarvis
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!onApprove ? (
        <p className="text-xs text-muted-foreground">
          Reject here, or{" "}
          <Link to="/admin/jarvis" className="underline">
            open Jarvis
          </Link>{" "}
          to approve (including bulk approve for undoable, non-send, non-spend actions).
        </p>
      ) : null}
      <ApprovalsQueue
        entries={entries}
        busyKey={pending}
        bulkBusy={bulkBusy}
        onApprove={handleApprove}
        onReject={(entry) => {
          void rejectOne(entry);
        }}
        onBulkApprove={onApprove ? handleBulkApprove : undefined}
        onBulkReject={(items) => {
          void bulkReject(items);
        }}
      />
    </div>
  );
}
