import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Home, Loader2, Plus, Trash2 } from "lucide-react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAddPage,
  useDeletePage,
  useDuplicatePage,
  useReorderPages,
  useSavePage,
  useSetHomePage,
} from "@/lib/website-content.hooks";
import { PAGE_LIBRARY, pageLabel, type ContentPage } from "@/lib/website-content";
import { cn } from "@/lib/utils";

/**
 * Page-level controls: add, rename, duplicate, hide, reorder, choose the home
 * page and delete. Sections are edited one level down in WebsiteStructure.
 */
export function PageManager({
  pages,
  organizationId,
  canManage,
}: {
  pages: ContentPage[];
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const savePage = useSavePage(organizationId);
  const addPage = useAddPage(organizationId);
  const duplicatePage = useDuplicatePage(organizationId);
  const reorderPages = useReorderPages(organizationId);
  const setHome = useSetHomePage(organizationId);
  const deletePage = useDeletePage(organizationId);

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<string>("custom");

  const ordered = [...pages].sort((a, b) => a.sort_order - b.sort_order);
  const homeId = ordered.find((p) => p.kind === "home")?.id ?? null;

  const move = (index: number, direction: -1 | 1) => {
    const next = [...ordered];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    reorderPages.mutate(next.map((p) => p.id));
  };

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Pages"
        title="Manage every page on your site"
        action={
          canManage ? (
            <Button variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" />
              {adding ? "Close" : "Add a page"}
            </Button>
          ) : null
        }
      />
      <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
        Rename a page, copy one you already like, hide it from visitors while you work on it, change
        the order it appears in your menu, or pick which page people land on first.
      </p>

      {adding && canManage ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-border bg-elevated p-4 sm:grid-cols-[1fr_200px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="page-title">Page name</Label>
            <Input
              id="page-title"
              value={newTitle}
              placeholder="Emergency callouts"
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-kind">Page type</Label>
            <select
              id="page-kind"
              value={newKind}
              onChange={(event) => setNewKind(event.target.value)}
              className="h-11 sm:h-10 w-full cursor-pointer rounded-md border border-border bg-background px-3 text-sm"
            >
              {PAGE_LIBRARY.filter((p) => p.kind !== "home").map((p) => (
                <option key={p.kind} value={p.kind}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              variant="signal"
              disabled={addPage.isPending || !newTitle.trim()}
              onClick={() =>
                addPage.mutate(
                  { title: newTitle, kind: newKind, sortOrder: ordered.length },
                  {
                    onSuccess: () => {
                      setNewTitle("");
                      setAdding(false);
                    },
                  },
                )
              }
            >
              {addPage.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create page
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {ordered.map((page, index) => (
          <li
            key={page.id}
            className={cn(
              "rounded-lg border border-border bg-elevated p-3",
              !page.is_visible && "opacity-70",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                {canManage ? (
                  <input
                    aria-label={`Name for ${page.title}`}
                    defaultValue={page.title}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== page.title)
                        savePage.mutate({ id: page.id, patch: { title: value } });
                    }}
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground hover:border-border focus:border-primary focus:outline-none"
                  />
                ) : (
                  <p className="text-sm font-semibold text-foreground">{page.title}</p>
                )}
                <p className="mt-0.5 px-1 text-xs text-muted-foreground">
                  /{page.slug} · {pageLabel(page.kind)} · {page.sections.length} section
                  {page.sections.length === 1 ? "" : "s"}
                  {page.id === homeId ? " · home page" : ""}
                  {page.is_visible ? "" : " · hidden"}
                </p>
              </div>

              {canManage ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${page.title} up`}
                    disabled={index === 0 || reorderPages.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${page.title} down`}
                    disabled={index === ordered.length - 1 || reorderPages.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={page.is_visible ? `Hide ${page.title}` : `Show ${page.title}`}
                    onClick={() =>
                      savePage.mutate({ id: page.id, patch: { is_visible: !page.is_visible } })
                    }
                  >
                    {page.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Duplicate ${page.title}`}
                    disabled={duplicatePage.isPending}
                    onClick={() => duplicatePage.mutate(page)}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Make ${page.title} the home page`}
                    disabled={page.id === homeId || setHome.isPending}
                    onClick={() => setHome.mutate({ pageId: page.id, currentHomeId: homeId })}
                  >
                    <Home className={cn("size-4", page.id === homeId && "text-primary")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${page.title}`}
                    disabled={page.id === homeId || deletePage.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${page.title}" and everything on it?`))
                        deletePage.mutate(page);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
