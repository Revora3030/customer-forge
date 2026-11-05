/**
 * JC-41: "What Revora remembers" in Settings. Lists the notes the assistant may
 * use for this workspace (the PAI-6 store), with search, a filter, Confirm for
 * notes the assistant only suggested, Edit, Delete with a 30 second Undo, a
 * "why was this saved" view (source, quote, change history) and a local Pin.
 * Every write goes through the PAI-6 server functions, which check the owner,
 * the workspace and the rules (a guess is never confirmed by the assistant).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmptyState, ErrorNote, LoadingRows, Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  businessMemoryHistory,
  confirmBusinessMemory,
  deleteBusinessMemory,
  editBusinessMemory,
  listBusinessMemory,
  restoreBusinessMemory,
  saveBusinessMemory,
} from "@/lib/business-memory.functions";
import { MAX_KEY, MAX_VALUE, MEMORY_KINDS, type BusinessMemoryRow, type MemoryKind } from "@/lib/business-memory";
import {
  FILTER_LABEL,
  KIND_LABEL,
  NOTE_FILTERS,
  UNDO_SECONDS,
  countByFilter,
  filterNotes,
  historyLine,
  orderNotes,
  readPins,
  togglePin,
  whySaved,
  writePins,
  type NoteFilter,
} from "@/lib/business-memory-manager";

type MemoryHistoryEvent = { id: number; action: string; actor_kind: string; created_at: string };
type Result = { ok: true } | { ok: false; problem: string };

export type MemoryManagerViewProps = {
  notes: BusinessMemoryRow[];
  total: number;
  counts: Record<NoteFilter, number>;
  query: string;
  filter: NoteFilter;
  canManage: boolean;
  pinned: ReadonlySet<string>;
  editing: { id: string; key: string; value: string } | null;
  expandedId: string | null;
  history: MemoryHistoryEvent[] | null;
  busy: boolean;
  message: { kind: "ok" | "error"; text: string } | null;
  undo: { key: string; secondsLeft: number } | null;
  onQuery: (value: string) => void;
  onFilter: (filter: NoteFilter) => void;
  onConfirm: (id: string) => void;
  onEditStart: (note: BusinessMemoryRow) => void;
  onEditChange: (change: { key?: string; value?: string }) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (note: BusinessMemoryRow) => void;
  onUndo: () => void;
  onPin: (id: string) => void;
  onWhy: (id: string) => void;
  adding: { kind: MemoryKind; key: string; value: string } | null;
  onAddStart: () => void;
  onAddChange: (change: { kind?: MemoryKind; key?: string; value?: string }) => void;
  onAddSave: () => void;
  onAddCancel: () => void;
};

export function MemoryManagerView(props: MemoryManagerViewProps) {
  const { notes, total, counts, filter, canManage, editing, expandedId } = props;
  return (
    <Panel id="memory-manager" className="scroll-mt-24 p-5">
      <SectionHeading
        eyebrow="Memory"
        title="What Revora remembers"
        description="Notes about your business that the assistant may use. Anything it only guessed waits for your OK before it counts."
        action={
          canManage && !props.adding ? (
            <Button variant="outline" onClick={props.onAddStart}>Add a note</Button>
          ) : undefined
        }
      />

      {props.message ? (
        props.message.kind === "error" ? (
          <div className="mt-3"><ErrorNote message={props.message.text} /></div>
        ) : (
          <p role="status" className="mt-3 text-[13px] text-muted-foreground">{props.message.text}</p>
        )
      ) : null}

      {props.undo ? (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-[13px]">
          <span>Deleted “{props.undo.key}”.</span>
          <Button variant="outline" size="sm" onClick={props.onUndo} disabled={props.busy}>
            Undo ({props.undo.secondsLeft}s)
          </Button>
        </div>
      ) : null}

      {props.adding ? (
        <form
          className="mt-4 space-y-3 rounded-md border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            props.onAddSave();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="memory-add-kind">Kind</Label>
              <select
                id="memory-add-kind"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-[14px]"
                value={props.adding.kind}
                onChange={(event) => props.onAddChange({ kind: event.target.value as MemoryKind })}
              >
                {MEMORY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memory-add-key">Label</Label>
              <Input id="memory-add-key" maxLength={MAX_KEY} value={props.adding.key} onChange={(event) => props.onAddChange({ key: event.target.value })} placeholder="Opening hours" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memory-add-value">What to remember</Label>
            <Textarea id="memory-add-value" maxLength={MAX_VALUE} value={props.adding.value} onChange={(event) => props.onAddChange({ value: event.target.value })} placeholder="Monday to Friday, 9am to 5pm" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={props.busy}>Save note</Button>
            <Button type="button" variant="outline" onClick={props.onAddCancel}>Cancel</Button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="memory-search">Search notes</Label>
          <Input id="memory-search" type="search" value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Search by label or text" />
        </div>
        <div role="group" aria-label="Filter notes" className="flex flex-wrap gap-2">
          {NOTE_FILTERS.map((option) => (
            <Button key={option} type="button" size="sm" variant={filter === option ? "default" : "outline"} aria-pressed={filter === option} onClick={() => props.onFilter(option)}>
              {FILTER_LABEL[option]} ({counts[option]})
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[12px] text-muted-foreground" aria-live="polite">
        {notes.length === total ? `${total} note${total === 1 ? "" : "s"}` : `Showing ${notes.length} of ${total}`}
      </p>

      {total === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing saved yet" description="When you tell the assistant something about your business, or add a note here, it shows up with where it came from." />
        </div>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No notes match. Clear the search or pick “All”.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((note) => {
            const why = whySaved(note);
            const isEditing = editing?.id === note.id;
            const pinned = props.pinned.has(note.id);
            return (
              <li key={note.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <span>{KIND_LABEL[note.kind]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{note.status === "proposed" ? "Needs your OK" : "Confirmed"}</span>
                  {pinned ? <><span aria-hidden="true">·</span><span>Pinned on this device</span></> : null}
                </div>
                {isEditing && editing ? (
                  <form
                    className="mt-2 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      props.onEditSave();
                    }}
                  >
                    <Label htmlFor={`memory-key-${note.id}`}>Label</Label>
                    <Input id={`memory-key-${note.id}`} maxLength={MAX_KEY} value={editing.key} onChange={(event) => props.onEditChange({ key: event.target.value })} />
                    <Label htmlFor={`memory-value-${note.id}`}>Text</Label>
                    <Textarea id={`memory-value-${note.id}`} maxLength={MAX_VALUE} value={editing.value} onChange={(event) => props.onEditChange({ value: event.target.value })} />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={props.busy}>Save</Button>
                      <Button type="button" size="sm" variant="outline" onClick={props.onEditCancel}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="mt-1 font-display text-[15px] font-semibold">{note.key}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[14px]">{note.value}</p>
                  </>
                )}
                <p className="mt-2 text-[12px] text-muted-foreground">{why.source}{why.saved ? ` · saved ${why.saved}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {canManage && note.status === "proposed" ? (
                    <Button size="sm" onClick={() => props.onConfirm(note.id)} disabled={props.busy}>Confirm</Button>
                  ) : null}
                  {canManage && !isEditing ? (
                    <Button size="sm" variant="outline" onClick={() => props.onEditStart(note)}>Edit</Button>
                  ) : null}
                  <Button size="sm" variant="outline" aria-pressed={pinned} onClick={() => props.onPin(note.id)}>{pinned ? "Unpin" : "Pin"}</Button>
                  <Button size="sm" variant="outline" aria-expanded={expandedId === note.id} onClick={() => props.onWhy(note.id)}>Why was this saved?</Button>
                  {canManage ? (
                    <Button size="sm" variant="outline" onClick={() => props.onDelete(note)} disabled={props.busy}>Delete</Button>
                  ) : null}
                </div>
                {expandedId === note.id ? (
                  <div className="mt-3 space-y-1 rounded-md bg-elevated p-3 text-[13px]">
                    <p>{why.source}.</p>
                    {why.quote ? <p>The words it came from: “{why.quote}”</p> : null}
                    {note.source_id && note.source_type !== "url" ? <p className="text-muted-foreground">Source reference: {note.source_id}</p> : null}
                    {why.confirmed ? <p>Confirmed {why.confirmed}.</p> : <p>Not confirmed yet, so the assistant treats it as a guess.</p>}
                    {props.history === null ? (
                      <p className="text-muted-foreground">Loading history…</p>
                    ) : props.history.length === 0 ? (
                      <p className="text-muted-foreground">No changes recorded.</p>
                    ) : (
                      <ul className="list-disc pl-5">
                        {props.history.map((event) => (
                          <li key={event.id}>{historyLine(event)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!canManage ? <p className="mt-3 text-[12px] text-muted-foreground">Only a workspace owner or admin can change these notes.</p> : null}
      <p className="mt-3 text-[12px] text-muted-foreground">Pinning only moves a note to the top of this list on this device. It does not change what the assistant uses.</p>
    </Panel>
  );
}

const asResult = (value: unknown): Result => {
  const row = value as { ok?: unknown; problem?: unknown } | null;
  return row && row.ok === true ? { ok: true } : { ok: false, problem: typeof row?.problem === "string" ? row.problem : "That did not work. Try again." };
};

export function BusinessMemoryManager({ organizationId, canManage }: { organizationId: string | null | undefined; canManage: boolean }) {
  if (!organizationId) return null;
  return <Loaded organizationId={organizationId} canManage={canManage} />;
}

function Loaded({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const client = useQueryClient();
  const list = useServerFn(listBusinessMemory);
  const history = useServerFn(businessMemoryHistory);
  const confirm = useServerFn(confirmBusinessMemory);
  const edit = useServerFn(editBusinessMemory);
  const remove = useServerFn(deleteBusinessMemory);
  const restore = useServerFn(restoreBusinessMemory);
  const save = useServerFn(saveBusinessMemory);
  const listKey = useMemo(() => ["business-memory", organizationId], [organizationId]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<{ id: string; key: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ kind: MemoryKind; key: string; value: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [undo, setUndo] = useState<{ id: string; key: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setPinned(readPins(organizationId, typeof window === "undefined" ? null : window.localStorage));
  }, [organizationId]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= undo.until) setUndo(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [undo]);

  const notesQuery = useQuery({
    queryKey: listKey,
    queryFn: () => list({ data: { organizationId } }) as Promise<BusinessMemoryRow[]>,
    staleTime: 15_000,
  });
  const historyQuery = useQuery({
    queryKey: ["business-memory-history", organizationId, expandedId],
    queryFn: () => history({ data: { organizationId, id: expandedId! } }) as Promise<MemoryHistoryEvent[]>,
    enabled: expandedId !== null,
  });

  const run = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => asResult(await job()),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: listKey });
      void client.invalidateQueries({ queryKey: ["business-memory-history", organizationId] });
    },
  });
  const act = async (job: () => Promise<unknown>, done: string, after?: () => void) => {
    setMessage(null);
    try {
      const result = await run.mutateAsync(job);
      if (result.ok) {
        setMessage({ kind: "ok", text: done });
        after?.();
      } else {
        setMessage({ kind: "error", text: result.problem });
      }
    } catch {
      setMessage({ kind: "error", text: "That did not work. Check your connection and try again." });
    }
  };

  const fetched = notesQuery.data;
  const rows = useMemo(() => fetched ?? [], [fetched]);
  const shown = useMemo(() => orderNotes(filterNotes(rows, { query, filter }), pinned), [rows, query, filter, pinned]);

  if (notesQuery.isLoading) return <LoadingRows rows={3} />;
  if (notesQuery.isError) return <ErrorNote message="Your saved notes could not be loaded. Refresh to try again." />;

  return (
    <MemoryManagerView
      notes={shown}
      total={rows.length}
      counts={countByFilter(rows)}
      query={query}
      filter={filter}
      canManage={canManage}
      pinned={pinned}
      editing={editing}
      expandedId={expandedId}
      history={expandedId === null || historyQuery.isLoading ? null : (historyQuery.data ?? [])}
      busy={run.isPending}
      message={message}
      undo={undo ? { key: undo.key, secondsLeft: Math.max(0, Math.min(UNDO_SECONDS, Math.ceil((undo.until - now) / 1000))) } : null}
      adding={adding}
      onQuery={setQuery}
      onFilter={setFilter}
      onConfirm={(id) => void act(() => confirm({ data: { organizationId, id } }), "Confirmed. The assistant can use this note now.")}
      onEditStart={(note) => setEditing({ id: note.id, key: note.key, value: note.value })}
      onEditChange={(change) => setEditing((current) => (current ? { ...current, ...change } : current))}
      onEditSave={() => {
        if (!editing) return;
        void act(() => edit({ data: { organizationId, id: editing.id, key: editing.key, value: editing.value } }), "Saved.", () => setEditing(null));
      }}
      onEditCancel={() => setEditing(null)}
      onDelete={(note) =>
        void act(() => remove({ data: { organizationId, id: note.id } }), "Deleted.", () => {
          const at = Date.now();
          setNow(at);
          setUndo({ id: note.id, key: note.key, until: at + UNDO_SECONDS * 1000 });
        })
      }
      onUndo={() => {
        if (!undo) return;
        const target = undo;
        void act(() => restore({ data: { organizationId, id: target.id } }), "Restored.", () => setUndo(null));
      }}
      onPin={(id) =>
        setPinned((current) => {
          const next = togglePin(current, id);
          writePins(organizationId, next, typeof window === "undefined" ? null : window.localStorage);
          return next;
        })
      }
      onWhy={(id) => setExpandedId((current) => (current === id ? null : id))}
      onAddStart={() => setAdding({ kind: "fact", key: "", value: "" })}
      onAddChange={(change) => setAdding((current) => (current ? { ...current, ...change } : current))}
      onAddSave={() => {
        if (!adding) return;
        void act(() => save({ data: { organizationId, kind: adding.kind, key: adding.key, value: adding.value } }), "Saved. You told us this, so it is confirmed.", () => setAdding(null));
      }}
      onAddCancel={() => setAdding(null)}
    />
  );
}
