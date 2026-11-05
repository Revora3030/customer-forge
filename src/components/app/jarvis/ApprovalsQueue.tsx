import { Button } from "@/components/ui/button";
import { bulkApproveEligibleEntries, type InboxEntry } from "@/lib/jarvis/approvals-inbox";
import { ApprovalSafetySummary } from "./ApprovalSafety";

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

type QueueProps = {
  entries: readonly InboxEntry[];
  busyKey: string | null;
  /** True while a bulk reject/approve is in flight. */
  bulkBusy?: boolean | undefined;
  onApprove: (entry: InboxEntry) => void;
  onReject: (entry: InboxEntry) => void;
  /**
   * JC-55: approve every entry that passes the bulk gate. Omit to hide the
   * bulk-approve control (e.g. when the host cannot run the chat approve path).
   */
  onBulkApprove?: ((entries: InboxEntry[]) => void) | undefined;
  /** Reject every waiting entry. Reject is safe for all classes. */
  onBulkReject?: ((entries: InboxEntry[]) => void) | undefined;
};

/**
 * JC-55: shared presentation for `/admin/approvals` and the Jarvis chat inbox.
 * One card UI, one bulk-approve gate (undoable Yes + sends No + spends No).
 */
export function ApprovalsQueue({
  entries,
  busyKey,
  bulkBusy = false,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
}: QueueProps) {
  const bulkable = bulkApproveEligibleEntries(entries);
  const anyBusy = bulkBusy || busyKey !== null;
  return (
    <div className="space-y-3" data-testid="approvals-queue">
      {entries.length > 1 && (onBulkApprove || onBulkReject) ? (
        <div className="flex flex-wrap gap-2">
          {onBulkReject ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={anyBusy || entries.length === 0}
              data-testid="bulk-reject"
              onClick={() => onBulkReject([...entries])}
            >
              Reject all {entries.length}
            </Button>
          ) : null}
          {onBulkApprove ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={anyBusy || bulkable.length === 0}
              data-testid="bulk-approve"
              title={
                bulkable.length
                  ? "Only approvals that can be undone, do not send to a person, and do not spend money."
                  : "None of these are safe to bulk-approve (must be undoable, not send to a person, and not spend money)."
              }
              onClick={() => onBulkApprove(bulkable)}
            >
              Approve all safe{bulkable.length ? ` (${bulkable.length})` : ""}
            </Button>
          ) : null}
        </div>
      ) : null}
      {entries.length === 1 && onBulkApprove && bulkable.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          This one is safe to approve in bulk when more undoable items wait here.
        </p>
      ) : null}
      <ul className="space-y-3">
        {entries.map((entry) => (
          <InboxCard
            key={entry.key}
            entry={entry}
            busy={anyBusy || busyKey === entry.key}
            onApprove={() => onApprove(entry)}
            onReject={() => onReject(entry)}
          />
        ))}
      </ul>
    </div>
  );
}

