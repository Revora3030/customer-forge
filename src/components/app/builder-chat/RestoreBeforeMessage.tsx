/**
 * "Restore to before this message" under each owner message in the builder
 * chat (CU-5). It finds the newest checkpoint published before the message
 * was sent and, after a confirm, puts it back live through the normal publish
 * path. Shown only to owners and admins (the server re-checks), and only when
 * such a checkpoint exists and is not already the live site.
 */
import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCheckpoints,
  useRestoreCheckpoint,
} from "@/components/app/builder-chat/use-checkpoints";
import { checkpointBefore, checkpointTitle, messageSentAt } from "@/lib/builder/checkpoints";
import { dateShort, timeShort } from "@/lib/format";

export function RestoreBeforeMessage({
  organizationId,
  task,
}: {
  organizationId: string | null | undefined;
  task: { id: string; sentAt?: string | undefined };
}) {
  const [confirm, setConfirm] = useState(false);
  // Stamped on first render, which for a message sent now is when it was sent.
  const [sentAt] = useState(() => messageSentAt(task));
  const query = useCheckpoints(organizationId);
  const restore = useRestoreCheckpoint(organizationId, () => setConfirm(false));
  if (!organizationId || !query.data?.allowed) return null;
  const target = checkpointBefore(query.data.checkpoints, sentAt);
  if (!target) return null;
  const title = checkpointTitle(target);

  return (
    <div className="flex justify-end" data-testid="restore-before-message">
      {confirm ? (
        <div
          className="ml-auto max-w-[85%] space-y-2 rounded-xl border border-border/70 p-2.5 text-[12.5px]"
          role="group"
          aria-label="Confirm restore to before this message"
        >
          <p>
            Put {title} ({dateShort(target.date)} {timeShort(target.date)}) back on your live site?
            Visitors see it right away. Your draft is unchanged.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={restore.isPending}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ id: target.id, version: target.version })}
            >
              {restore.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="size-4" aria-hidden />
              )}
              Yes, restore
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="relative inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] text-muted-foreground underline-offset-2 after:absolute after:-inset-1 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Undo2 className="size-3.5" aria-hidden /> Restore to before this message
        </button>
      )}
    </div>
  );
}
