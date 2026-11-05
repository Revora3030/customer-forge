/**
 * PAI-15: the log of a background run started from the builder chat. Same look as the
 * build's work log. Every line is an event the server recorded; nothing is added.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAgentRunFeed } from "@/lib/builder/agent-run-feed.hooks";
import type { RunFeed, UsedNote } from "@/lib/builder/agent-run-feed";
import { cn } from "@/lib/utils";

export function AgentRunFeed({
  organizationId,
  runId,
}: {
  organizationId: string | null | undefined;
  runId: string;
}) {
  const { feed, loading } = useAgentRunFeed(organizationId, runId);
  if (loading || !feed) return null;
  return <AgentRunFeedView feed={feed} />;
}

export function AgentRunFeedView({ feed }: { feed: RunFeed }) {
  const live = feed.state === "queued" || feed.state === "running";
  const [open, setOpen] = useState(live || feed.state === "failed" || feed.state === "waiting");
  return (
    <div
      className="overflow-hidden rounded-xl border border-border/70 bg-card/40"
      data-testid="agent-run-feed"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <span className="grid size-5 shrink-0 place-items-center" aria-hidden>
          {live ? (
            <span className="size-2 rounded-full bg-primary" />
          ) : feed.state === "done" ? (
            <Check className="size-4 text-emerald-400" />
          ) : (
            <TriangleAlert
              className={cn(
                "size-4",
                feed.state === "waiting" ? "text-amber-500" : "text-destructive",
              )}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-sm leading-5 break-words"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {live ? <Shimmer as="span">{feed.headline}</Shimmer> : feed.headline}
          </span>
          {feed.detail ? (
            <span className="block text-xs break-words text-muted-foreground">{feed.detail}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {feed.memory.length ? <UsedNoteChips notes={feed.memory} /> : null}
      {open && feed.lines.length ? (
        <ol className="space-y-1.5 border-t border-border/60 px-3.5 py-3" aria-label="Run steps">
          {feed.lines.map((line) => (
            <li
              key={line.id}
              className={cn(
                "text-[13px] leading-5 break-words",
                line.tone === "warn" ? "text-amber-600" : "text-foreground",
              )}
            >
              {line.text}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * JC-42: a small "Used: <note>" chip for every saved note the assistant was given for this run.
 * Chips come only from the run's own record; tapping one opens the Memory manager in Settings.
 */
export function UsedNoteChips({ notes }: { notes: UsedNote[] }) {
  return (
    <ul
      className="flex flex-wrap gap-1.5 border-t border-border/60 px-3.5 py-2.5"
      aria-label="Saved notes used for this run"
      data-testid="used-note-chips"
    >
      {notes.map((note) => (
        <li key={note.id} className="max-w-full">
          <Link
            to="/app/settings"
            hash="memory-manager"
            title={`${note.source ? `${note.source}. ` : ""}${note.confirmed ? "Confirmed by you." : "Not confirmed yet."} Tap to open your saved notes.`}
            className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs leading-4 transition-colors hover:bg-muted"
          >
            <span className="text-muted-foreground">Used:</span>
            <span className="truncate">{note.key}</span>
            {note.confirmed ? null : <span className="shrink-0 text-amber-600">(not confirmed)</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
