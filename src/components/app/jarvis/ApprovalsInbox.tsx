import { useMemo, useState } from "react";
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
import { ApprovalSafetySummary } from "./ApprovalSafety";

type Props = {
  /** The chat messages already loaded; a proposal's Approve needs its message. */
  rows: readonly InboxRow[];
  /** Runs the same approval the chat card runs (claim, then do the action). */
  onApprove: (key: string, proposal: WriteProposal) => void;
};

export const APPROVALS_QUERY_KEY = ["jarvis", "approvals"] as const;

/** One waiting approval: what, who it affects, the safety summary, and Approve or Reject. */
export function InboxCard({
  entry,
  busy,
  onApprove,
  onReject,
}: {
  entry: InboxEntry;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <li data-testid="approval-inbox-card" className="rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-medium">
        {entry.title}
        {entry.retry ? " (failed, can retry)" : ""}
      </p>
      <p className="mt-1 break-words text-sm text-muted-foreground">{entry.summary}</p>
      <p className="mt-1 text-xs text-muted-foreground">Affects: {entry.affects}</p>
      {entry.exact.length ? (
        <div
          className="mt-2 rounded-lg border border-border bg-background/60 p-2 text-xs"
          aria-label="Exactly what goes out"
        >
          <p className="font-medium">Exactly what goes out</p>
          {entry.exact.map((line) => (
            <p key={line.label} className="mt-1 whitespace-pre-wrap break-words">
              <span className="text-muted-foreground">{line.label}: </span>
              {line.value}
            </p>
          ))}
        </div>
      ) : null}
      <ApprovalSafetySummary safety={entry.safety} className="mt-2" />
      <p className="mt-2 text-xs text-muted-foreground">{entry.expiresLabel}</p>
      {entry.proposal ? null : (
        <p className="mt-2 text-xs text-muted-foreground">
          Open the conversation this came from to approve it. You can still reject it here.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={onReject}
        >
          Reject
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy || !entry.proposal}
          onClick={onApprove}
        >
          Approve
        </Button>
      </div>
    </li>
  );
}

/**
 * JC-36: a badge in the chat header that opens every waiting Jarvis approval.
 * It reads and rejects through the same functions as Operations → Approvals
 * and approves through the same path as the chat card, so there is one set of
 * approval rules. Rejecting needs no reason.
 */
export function ApprovalsInbox({ rows, onApprove }: Props) {
  const list = useServerFn(listJarvisApprovalsFn);
  const reject = useServerFn(rejectJarvisApprovalFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
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
  const decide = async (entry: InboxEntry, approve: boolean) => {
    if (approve) {
      if (!entry.proposal) return;
      setOpen(false);
      onApprove(entry.key, entry.proposal);
      return;
    }
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
      void qc.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
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
              approvals last 24 hours.
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
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <InboxCard
                    key={entry.key}
                    entry={entry}
                    busy={pending === entry.key}
                    onApprove={() => {
                      void decide(entry, true);
                    }}
                    onReject={() => {
                      void decide(entry, false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
