import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { listJarvisApprovalsFn, rejectJarvisApprovalFn } from "@/lib/jarvis.functions";
import type { WriteProposal } from "@/lib/jarvis-actions";
import {
  inboxEntries,
  proposalIndex,
  type InboxEntry,
  type InboxRow,
} from "@/lib/jarvis/approvals-inbox";
import { OPEN_APPROVALS_FLAG } from "@/lib/city-approval-beacons";
import { ApprovalsQueue, InboxCard } from "./ApprovalsQueue";

export { InboxCard };

type Props = {
  /** The chat messages already loaded; a proposal's Approve needs its message. */
  rows: readonly InboxRow[];
  /** Runs the same approval the chat card runs (claim, then do the action). */
  onApprove: (key: string, proposal: WriteProposal) => void;
};

export const APPROVALS_QUERY_KEY = ["jarvis", "approvals"] as const;

/**
 * JC-36 + JC-55: a badge in the chat header that opens every waiting Jarvis
 * approval. It shares ApprovalsQueue with `/admin/approvals`, rejects through
 * rejectJarvisApprovalFn, and approves through the same chat path as the card.
 * JC-14: AI City approval beacons set OPEN_APPROVALS_FLAG so this sheet opens once.
 */
export function ApprovalsInbox({ rows, onApprove }: Props) {
  const list = useServerFn(listJarvisApprovalsFn);
  const reject = useServerFn(rejectJarvisApprovalFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // JC-14: a tap on an AI City approval beacon sends the owner here and asks for the sheet once.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPEN_APPROVALS_FLAG)) {
        sessionStorage.removeItem(OPEN_APPROVALS_FLAG);
        setOpen(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  const [pending, setPending] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const approvals = useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: () => list(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const proposals = useMemo(() => proposalIndex(rows), [rows]);
  const entries = useMemo(
    () => inboxEntries(approvals.data?.items ?? [], proposals),
    [approvals.data, proposals],
  );
  const count = entries.length;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
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

  const decide = (entry: InboxEntry, approve: boolean) => {
    if (approve) {
      if (!entry.proposal) return;
      setOpen(false);
      onApprove(entry.key, entry.proposal);
      return;
    }
    void rejectOne(entry);
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
          /* keep going; toast summary after */
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

  const bulkApprove = (items: InboxEntry[]) => {
    if (!items.length) return;
    setOpen(false);
    for (const entry of items) {
      if (!entry.proposal) continue;
      onApprove(entry.key, entry.proposal);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-jarvis-tap=""
        aria-label={count ? `Approvals, ${count} waiting` : "Approvals, none waiting"}
        onClick={() => setOpen(true)}
        className="relative size-9 shrink-0 rounded-full"
      >
        <Inbox className="size-4" aria-hidden />
        {count ? (
          <span
            data-testid="approvals-badge"
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            aria-hidden
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-jarvis-sheet=""
          className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0"
        >
          <SheetHeader className="space-y-0.5 border-b border-border p-4 text-left sm:text-left">
            <SheetTitle>Approvals</SheetTitle>
            <SheetDescription>
              Everything Jarvis is waiting on you for. Nothing runs until you approve it, and
              approvals last 24 hours. Bulk approve only covers undoable actions that do not
              send to a person or spend money.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            {approvals.isError ? (
              <QueryErrorNotice
                title="Couldn't load approvals."
                retry={() => approvals.refetch()}
                retrying={approvals.isFetching}
              />
            ) : approvals.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : count === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is waiting for you.</p>
            ) : (
              <ApprovalsQueue
                entries={entries}
                busyKey={pending}
                bulkBusy={bulkBusy}
                onApprove={(entry) => decide(entry, true)}
                onReject={(entry) => decide(entry, false)}
                onBulkApprove={bulkApprove}
                onBulkReject={(items) => {
                  void bulkReject(items);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
