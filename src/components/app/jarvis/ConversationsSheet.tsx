import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, Check, Download, Folder, FolderInput, MessageSquarePlus, MoreHorizontal, Pencil, Pin, PinOff, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createJarvisConversation, listJarvisConversations, updateJarvisConversation, type JarvisConversation } from "@/lib/jarvis-conversations.functions";
import { getJarvisHistory, JARVIS_HISTORY_PAGE } from "@/lib/jarvis.functions";
import {
  arrangeConversations, conversationMarkdown, exportFilename, folderNames, isPinned, loadAllPages, readWorkspace, setFolder, togglePin, writeWorkspace,
  type ConversationWorkspace, type FolderFilter,
} from "@/lib/jarvis-conversation-workspace";

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function download(markdown: string, filename: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // iOS Safari only downloads from an attached link, and needs the URL alive briefly.
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Create, find, rename, pin, file into folders, export and archive Jarvis conversations (JC-43).
 * Pins and folders are kept on this device. Phone: bottom sheet; wide: left panel.
 */
export function ConversationsSheet({ open, onOpenChange, wide, activeId, onSelect }: {
  open: boolean; onOpenChange: (open: boolean) => void; wide: boolean; activeId: string | null; onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listJarvisConversations);
  const create = useServerFn(createJarvisConversation);
  const update = useServerFn(updateJarvisConversation);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [filing, setFiling] = useState<{ id: string; folder: string } | null>(null);
  const [ws, setWs] = useState<ConversationWorkspace>(() => readWorkspace());
  const [filter, setFilter] = useState<FolderFilter>({ kind: "all" });
  const [exporting, setExporting] = useState<string | null>(null);
  const history = useServerFn(getJarvisHistory);
  const folders = useMemo(() => folderNames(ws), [ws]);
  const saveWs = (next: ConversationWorkspace) => {
    setWs(next);
    if (!writeWorkspace(next)) toast.error("This device won't save pins and folders (private browsing?). They'll reset when you leave.");
  };
  const pin = (c: JarvisConversation) => {
    try { saveWs(togglePin(ws, c.id)); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't pin that."); }
  };
  const file = (id: string, folder: string) => {
    try { saveWs(setFolder(ws, id, folder)); setFiling(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't move that."); }
  };
  const exportOne = async (c: JarvisConversation) => {
    setExporting(c.id);
    try {
      const { rows, truncated } = await loadAllPages(
        (before) => history({ data: { conversationId: c.id, ...(before ? { before } : {}) } }),
        JARVIS_HISTORY_PAGE,
      );
      download(conversationMarkdown(c.title, rows, { truncated }), exportFilename(c.title));
    } catch {
      toast.error("Couldn't export that conversation.");
    } finally {
      setExporting(null);
    }
  };  const term = query.trim();
  const q = useQuery({
    queryKey: ["jarvis", "conversations", archived, term],
    queryFn: () => list({ data: { query: term, archived } }),
    enabled: open, staleTime: 15_000,
  });
  // A folder emptied by moving its last conversation falls back to "All".
  const activeFilter: FolderFilter = filter.kind === "folder" && !folders.includes(filter.name) ? { kind: "all" } : filter;
  const shown = arrangeConversations(q.data ?? [], ws, activeFilter);
  const refresh = () => qc.invalidateQueries({ queryKey: ["jarvis", "conversations"] });
  const start = useMutation({
    mutationFn: () => create(),
    onSuccess: (c) => { void refresh(); onSelect(c.id); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const change = useMutation({
    mutationFn: (v: { id: string; title?: string; archived?: boolean }) => update({ data: v }),
    onSuccess: (_r, v) => { setEditing(null); void refresh(); if (v.archived !== undefined) toast.success(v.archived ? "Conversation archived" : "Conversation restored"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={wide ? "left" : "bottom"} className={`${wide ? "w-full sm:max-w-sm" : "h-[85dvh] max-h-[85dvh] rounded-t-2xl"} flex flex-col gap-0 p-0 [&>button:first-child]:hidden`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 py-1 pl-4 pr-2">
          <SheetHeader className="min-w-0 space-y-0.5 pt-2 text-left">
            <SheetTitle>Conversations</SheetTitle>
            <SheetDescription>Each conversation keeps its own history. Pins and folders stay on this device.</SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close conversations"><X className="size-5" aria-hidden /></Button>
          </SheetClose>
        </div>
        <div className="shrink-0 space-y-2 border-b border-border/60 p-3">
          <Button type="button" className="min-h-11 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
            <MessageSquarePlus className="mr-2 size-4" aria-hidden />{start.isPending ? "Starting…" : "New conversation"}
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles and messages" aria-label="Search conversations" className="min-h-11 pl-9 text-base sm:text-sm" />
          </div>
          <div className="flex gap-1" role="group" aria-label="Show">
            <Button type="button" size="sm" variant={archived ? "ghost" : "secondary"} aria-pressed={!archived} onClick={() => setArchived(false)}>Active</Button>
            <Button type="button" size="sm" variant={archived ? "secondary" : "ghost"} aria-pressed={archived} onClick={() => setArchived(true)}>Archived</Button>
          </div>
          {folders.length ? (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Folders">
              <Button type="button" size="sm" variant={activeFilter.kind === "all" ? "secondary" : "ghost"} aria-pressed={activeFilter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>All</Button>
              {folders.map((name) => {
                const on = activeFilter.kind === "folder" && activeFilter.name === name;
                return (
                  <Button key={name} type="button" size="sm" variant={on ? "secondary" : "ghost"} aria-pressed={on} className="max-w-40 shrink-0" onClick={() => setFilter({ kind: "folder", name })}>
                    <Folder className="mr-1 size-3.5 shrink-0" aria-hidden /><span className="truncate">{name}</span>
                  </Button>
                );
              })}
              <Button type="button" size="sm" variant={activeFilter.kind === "none" ? "secondary" : "ghost"} aria-pressed={activeFilter.kind === "none"} className="shrink-0" onClick={() => setFilter({ kind: "none" })}>No folder</Button>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {q.isPending ? <p className="text-sm text-muted-foreground">Loading conversations…</p> : null}
          {q.isError ? (
            <div role="alert" className="space-y-2 text-sm"><p>Couldn't load your conversations.</p><Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>
          ) : null}
          {q.data && !q.data.length ? (
            <p className="text-sm text-muted-foreground">{term.length >= 2 ? "No conversations match that search." : archived ? "No archived conversations." : "No conversations yet."}</p>
          ) : null}
          {q.data?.length && !shown.length ? (
            <p className="text-sm text-muted-foreground">{activeFilter.kind === "none" ? "Every conversation here is in a folder." : "No conversations in this folder here."}</p>
          ) : null}
          <datalist id="jarvis-folder-names">{folders.map((name) => <option key={name} value={name} />)}</datalist>
          <ul className="space-y-1">
            {shown.map((c) => (
              <li key={c.id} className={`group flex items-center gap-1 rounded-lg ${c.id === activeId ? "bg-accent" : "hover:bg-muted/60"}`}>
                {filing?.id === c.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1 p-1" onSubmit={(e) => { e.preventDefault(); file(c.id, filing.folder); }}>
                    <Input autoFocus value={filing.folder} maxLength={40} list="jarvis-folder-names" placeholder="Folder name (empty = none)" onChange={(e) => setFiling({ id: c.id, folder: e.target.value })} aria-label={`Folder for ${c.title}`} className="min-h-11 text-base sm:text-sm" />
                    <Button type="submit" size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Save folder"><Check className="size-4" aria-hidden /></Button>
                    <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Cancel folder" onClick={() => setFiling(null)}><X className="size-4" aria-hidden /></Button>
                  </form>
                ) : editing?.id === c.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1 p-1" onSubmit={(e) => { e.preventDefault(); change.mutate({ id: c.id, title: editing.title }); }}>
                    <Input autoFocus value={editing.title} maxLength={120} onChange={(e) => setEditing({ id: c.id, title: e.target.value })} aria-label="Conversation name" className="min-h-11 text-base sm:text-sm" />
                    <Button type="submit" size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Save name" disabled={change.isPending}><Check className="size-4" aria-hidden /></Button>
                    <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Cancel rename" onClick={() => setEditing(null)}><X className="size-4" aria-hidden /></Button>
                  </form>
                ) : (
                  <>
                    <button type="button" className="min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-left" aria-current={c.id === activeId ? "true" : undefined} onClick={() => { onSelect(c.id); onOpenChange(false); }}>
                      <span className="flex items-center gap-1.5">
                        {isPinned(ws, c.id) ? <Pin className="size-3.5 shrink-0 text-primary" aria-label="Pinned" /> : null}
                        <span className="block truncate text-sm font-medium">{c.title}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{when(c.updated_at)}{ws.folders[c.id.toLowerCase()] ? ` · ${ws.folders[c.id.toLowerCase()]}` : ""}</span>
                    </button>
                    <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" aria-label={`Rename ${c.title}`} onClick={() => setEditing({ id: c.id, title: c.title })}><Pencil className="size-4" aria-hidden /></Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" aria-label={`More for ${c.title}`}><MoreHorizontal className="size-4" aria-hidden /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem className="min-h-11" onSelect={() => pin(c)}>
                          {isPinned(ws, c.id) ? <PinOff className="mr-2 size-4" aria-hidden /> : <Pin className="mr-2 size-4" aria-hidden />}{isPinned(ws, c.id) ? "Unpin" : "Pin to top"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11" onSelect={() => setFiling({ id: c.id, folder: ws.folders[c.id.toLowerCase()] ?? "" })}>
                          <FolderInput className="mr-2 size-4" aria-hidden />Move to folder…
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11" disabled={exporting === c.id} onSelect={() => { void exportOne(c); }}>
                          <Download className="mr-2 size-4" aria-hidden />{exporting === c.id ? "Exporting…" : "Export as Markdown"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" aria-label={`${c.archived ? "Restore" : "Archive"} ${c.title}`} disabled={change.isPending} onClick={() => change.mutate({ id: c.id, archived: !c.archived })}>
                      {c.archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
