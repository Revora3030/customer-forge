/**
 * Checkpoint timeline in the builder chat (CU-5).
 *
 * A "Checkpoints" button in the chat header opens a panel listing every saved
 * copy of the published site, newest first. The owner can name a checkpoint,
 * pin it (pinned ones are never cleaned up), compare it with the live site on
 * a before/after slider, and restore it with one press and a confirm. A
 * restore republishes that copy through the normal publish path as a new
 * checkpoint, so it can be undone too; the draft is never touched.
 *
 * Owners and admins only: the server returns nothing for anyone else, so the
 * button does not render for them.
 */
import { useState } from "react";
import { History, Loader2, Pencil, Pin, PinOff, SplitSquareHorizontal, Undo2 } from "lucide-react";
import { Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CheckpointCompare } from "@/components/app/builder-chat/CheckpointCompare";
import {
  useCheckpoints,
  useRestoreCheckpoint,
  useUpdateCheckpoint,
} from "@/components/app/builder-chat/use-checkpoints";
import { CHECKPOINT_NAME_MAX, checkpointTitle, type Checkpoint } from "@/lib/builder/checkpoints";
import { restorableVersions } from "@/lib/site-versions";
import { dateShort, timeShort } from "@/lib/format";

/** Header button + panel. Renders nothing until the server says this person may use checkpoints. */
export function CheckpointTimelineButton({
  organizationId,
}: {
  organizationId: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const query = useCheckpoints(organizationId);
  if (!organizationId || !query.data?.allowed) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Checkpoints"
        title="Checkpoints"
        data-testid="checkpoint-timeline-button"
        onClick={() => setOpen(true)}
        className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <History className="size-4" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60 p-4 text-left">
            <SheetTitle>Checkpoints</SheetTitle>
            <SheetDescription>
              A copy is saved every time your site goes live. Name or pin the ones you want to keep;
              pinned checkpoints are never cleaned up.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <CheckpointTimeline organizationId={organizationId} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function CheckpointTimeline({ organizationId }: { organizationId: string }) {
  const query = useCheckpoints(organizationId);
  const checkpoints = query.data?.checkpoints ?? [];
  const restorable = new Set(restorableVersions(checkpoints).map((entry) => entry.id));
  if (query.isLoading)
    return <p className="text-[13px] text-muted-foreground">Loading checkpoints…</p>;
  if (query.isError)
    return (
      <p className="text-[13px] text-destructive">Couldn't load your checkpoints right now.</p>
    );
  if (!query.data?.allowed) return null;
  if (!checkpoints.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        No checkpoints yet. One is saved each time your site goes live.
      </p>
    );
  return (
    <ol
      className="relative space-y-2 border-l border-border/70 pl-3"
      data-testid="checkpoint-timeline"
    >
      {checkpoints.map((entry) => (
        <CheckpointRow
          key={entry.id}
          organizationId={organizationId}
          entry={entry}
          canRestore={!entry.isLive && restorable.has(entry.id)}
        />
      ))}
    </ol>
  );
}

function CheckpointRow({
  organizationId,
  entry,
  canRestore,
}: {
  organizationId: string;
  entry: Checkpoint;
  canRestore: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entry.name ?? "");
  const restore = useRestoreCheckpoint(organizationId, () => setConfirm(false));
  const update = useUpdateCheckpoint(organizationId);
  const title = checkpointTitle(entry);

  return (
    <li
      className="relative rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-[13px]"
      data-testid={`checkpoint-${entry.version}`}
    >
      <span aria-hidden className="absolute top-3.5 -left-[17px] size-2 rounded-full bg-primary" />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{title}</span>
        {entry.name ? <span className="text-muted-foreground">· v{entry.version}</span> : null}
        {entry.isLive ? <Pill tone="signal">Live now</Pill> : null}
        {entry.pinned ? <Pill tone="neutral">Pinned</Pill> : null}
        {entry.kind === "restore" ? (
          <Pill tone="neutral">Restore of v{entry.restoredFrom}</Pill>
        ) : null}
        {entry.verification === "failed" ? <Pill tone="danger">Live check failed</Pill> : null}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {dateShort(entry.date)} {timeShort(entry.date)} · {entry.who}
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{entry.summary}</p>

      {editing ? (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(
              { versionId: entry.id, name: name.trim() || null },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <Input
            autoFocus
            value={name}
            maxLength={CHECKPOINT_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
            placeholder="e.g. Before spring prices"
            aria-label={`Name ${title}`}
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" size="sm" className="min-h-11" disabled={update.isPending}>
            Save
          </Button>
        </form>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          aria-pressed={entry.pinned}
          disabled={update.isPending}
          onClick={() => update.mutate({ versionId: entry.id, pinned: !entry.pinned })}
        >
          {entry.pinned ? (
            <PinOff className="size-4" aria-hidden />
          ) : (
            <Pin className="size-4" aria-hidden />
          )}
          {entry.pinned ? "Unpin" : "Pin"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => setEditing((value) => !value)}
        >
          <Pencil className="size-4" aria-hidden />
          {entry.name ? "Rename" : "Name"}
        </Button>
        {!entry.isLive ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            aria-expanded={comparing}
            onClick={() => setComparing((value) => !value)}
          >
            <SplitSquareHorizontal className="size-4" aria-hidden />
            {comparing ? "Hide compare" : "Compare"}
          </Button>
        ) : null}
        {canRestore && !confirm ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            data-testid={`checkpoint-restore-${entry.version}`}
            onClick={() => setConfirm(true)}
          >
            <Undo2 className="size-4" aria-hidden />
            Restore
          </Button>
        ) : null}
      </div>

      {confirm ? (
        <div
          className="mt-2 space-y-2 rounded-md border border-border/70 p-2.5"
          role="group"
          aria-label={`Confirm restore of ${title}`}
        >
          <p className="text-[12.5px]">
            Put {title} back on your live site now? Visitors see it right away. Your draft is
            unchanged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ id: entry.id, version: entry.version })}
            >
              {restore.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="size-4" aria-hidden />
              )}
              Yes, restore it
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={restore.isPending}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {comparing ? (
        <div className="mt-2">
          <CheckpointCompare
            organizationId={organizationId}
            versionId={entry.id}
            beforeLabel={title}
          />
        </div>
      ) : null}
    </li>
  );
}
