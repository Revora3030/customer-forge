import { useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Plus,
  Search,
  Sparkle,
  Target,
  Trash2,
} from "lucide-react";
import { askAssistant } from "@/lib/assistant-bridge";
import { sectionGuide } from "@/lib/section-guide";
import { EmptyState, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddSection,
  useDeleteSection,
  useMoveSection,
  useReorderComponents,
  useReorderSections,
  useSaveComponent,
  useSavePage,
  useSaveSection,
  useWebsiteContent,
} from "@/lib/website-content.hooks";
import {
  PAGE_SEO_FIELDS,
  SECTION_LIBRARY,
  readSectionSeo,
  sectionLabel,
  writeSectionSeo,
  type ContentPage,
  type ContentSection,
  type SectionKind,
} from "@/lib/website-content";
import { PageManager } from "@/components/app/PageManager";
import { cn } from "@/lib/utils";

/**
 * Pages and sections editor. Everything shown here is built from the business
 * information already entered — the owner reorders, hides and rewords it.
 */
export function WebsiteStructure({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const { data: pages, isLoading } = useWebsiteContent(organizationId);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const list = pages ?? [];
  const page = list.find((p) => p.slug === (activeSlug ?? list[0]?.slug)) ?? null;

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <SectionHeading
          eyebrow="Structure"
          title="Your pages and sections"
        />
        <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
          Your pages and sections are written by Revora's design team in the builder chat. Ask there
          for a new page, a different layout or fresh wording — this view shows what exists today.
        </p>

        {list.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveSlug(p.slug)}
                className={cn(
                  "cursor-pointer rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                  page?.id === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-elevated",
                )}
              >
                {p.title}
                <span className="ml-2 text-[11px] text-muted-foreground">{p.sections.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Panel>

      {list.length ? (
        <PageManager pages={list} organizationId={organizationId} canManage={canManage} />
      ) : null}

      {isLoading ? null : !list.length ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No pages yet"
          description="Open the builder chat and describe your business. Revora's design team writes your pages, layout and wording from there."
        />
      ) : page ? (
        <PageSections page={page} organizationId={organizationId} canManage={canManage} />
      ) : null}
    </div>
  );
}

function PageSections({
  page,
  organizationId,
  canManage,
}: {
  page: ContentPage;
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const saveSection = useSaveSection(organizationId);
  const moveSection = useMoveSection(organizationId);
  const addSection = useAddSection(organizationId);
  const deleteSection = useDeleteSection(organizationId);
  const reorderSections = useReorderSections(organizationId);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sections = [...page.sections].sort((a, b) => a.sort_order - b.sort_order);

  /** Reorders by id only, so nothing typed into a section is touched. */
  const dropSection = (targetId: string) => {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = sections.map((section) => section.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    reorderSections.mutate(ids);
  };

  return (
    <div className="space-y-3">
      <PageSeoPanel page={page} organizationId={organizationId} canManage={canManage} />

      {sections.map((section, index) => (
        <Panel
          key={section.id}
          className={cn(
            "p-4",
            dragId === section.id && "opacity-60",
            overId === section.id && dragId !== section.id && "border-primary",
          )}
          draggable={canManage}
          onDragStart={() => setDragId(section.id)}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(event: DragEvent) => {
            if (!canManage || !dragId) return;
            event.preventDefault();
            setOverId(section.id);
          }}
          onDrop={(event: DragEvent) => {
            event.preventDefault();
            dropSection(section.id);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {canManage ? (
                <span title="Drag to reorder">
                  <GripVertical
                    className="size-4 cursor-grab text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              ) : null}
              <Pill tone={section.is_visible ? "signal" : "neutral"}>
                {sectionLabel(section.kind)}
              </Pill>
              {section.components.length ? (
                <span className="text-[11px] text-muted-foreground">
                  {section.components.length} item{section.components.length === 1 ? "" : "s"} from
                  your data
                </span>
              ) : null}
            </div>
            {canManage ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={section.is_visible ? "Hide section" : "Show section"}
                  onClick={() =>
                    saveSection.mutate({
                      id: section.id,
                      patch: { is_visible: !section.is_visible },
                    })
                  }
                >
                  {section.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move section up"
                  disabled={index === 0}
                  onClick={() => {
                    const previous = sections[index - 1];
                    if (previous)
                      moveSection.mutate({
                        a: { id: section.id, sort_order: section.sort_order },
                        b: { id: previous.id, sort_order: previous.sort_order },
                      });
                  }}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move section down"
                  disabled={index === sections.length - 1}
                  onClick={() => {
                    const next = sections[index + 1];
                    if (next)
                      moveSection.mutate({
                        a: { id: section.id, sort_order: section.sort_order },
                        b: { id: next.id, sort_order: next.sort_order },
                      });
                  }}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove section"
                  onClick={() => deleteSection.mutate(section.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>

          <SectionPurpose kind={section.kind} />

          <form
            className="mt-3 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              saveSection.mutate({
                id: section.id,
                patch: {
                  heading: String(form.get("heading") ?? "") || null,
                  subheading: String(form.get("subheading") ?? "") || null,
                  body: String(form.get("body") ?? "") || null,
                },
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`h-${section.id}`}>Heading</Label>
                <Input
                  id={`h-${section.id}`}
                  name="heading"
                  defaultValue={section.heading ?? ""}
                  placeholder={sectionGuide(section.kind).headingHint}
                  disabled={!canManage}
                />
                <p className="text-[11px] text-muted-foreground">
                  {sectionGuide(section.kind).headingHint}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`s-${section.id}`}>Supporting line</Label>
                <Input
                  id={`s-${section.id}`}
                  name="subheading"
                  defaultValue={section.subheading ?? ""}
                  placeholder={sectionGuide(section.kind).subHint}
                  disabled={!canManage}
                />
                <p className="text-[11px] text-muted-foreground">
                  {sectionGuide(section.kind).subHint}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`b-${section.id}`}>Text</Label>
              <Textarea
                id={`b-${section.id}`}
                name="body"
                rows={3}
                defaultValue={section.body ?? ""}
                placeholder={sectionGuide(section.kind).bodyHint}
                disabled={!canManage}
              />
              <p className="text-[11px] text-muted-foreground">
                {sectionGuide(section.kind).bodyHint}
              </p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" disabled={saveSection.isPending}>
                  Save section
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    askAssistant(
                      `${sectionGuide(section.kind).ask} (the ${sectionLabel(section.kind)} section on ${page.title}).`,
                    )
                  }
                >
                  <Sparkle className="size-4" /> Let the assistant write this
                </Button>
              </div>
            ) : null}
          </form>

          <SectionComponents
            section={section}
            organizationId={organizationId}
            canManage={canManage}
          />
          <SectionSeoFields
            section={section}
            organizationId={organizationId}
            canManage={canManage}
          />
        </Panel>
      ))}

      {canManage ? (
        <Panel className="p-4">
          {adding ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {SECTION_LIBRARY.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  className="cursor-pointer rounded-md border border-border p-3 text-left transition-colors hover:bg-elevated"
                  onClick={() => {
                    addSection.mutate({
                      pageId: page.id,
                      kind: item.kind as SectionKind,
                      sortOrder: sections.length,
                    });
                    setAdding(false);
                  }}
                >
                  <p className="text-[13px] font-medium">{item.label}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{item.help}</p>
                </button>
              ))}
            </div>
          ) : (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add a section to {page.title}
            </Button>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

/** Items inside a section (service cards, FAQ pairs, photos) — drag to reorder. */
function SectionComponents({
  section,
  organizationId,
  canManage,
}: {
  section: ContentSection;
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const reorder = useReorderComponents(organizationId);
  const saveComponent = useSaveComponent(organizationId);
  const [dragId, setDragId] = useState<string | null>(null);
  const items = [...section.components].sort((a, b) => a.sort_order - b.sort_order);
  if (!items.length) return null;

  const drop = (targetId: string) => {
    const sourceId = dragId;
    setDragId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    reorder.mutate(ids);
  };

  return (
    <div className="mt-4 rounded-md border border-border">
      <p className="border-b border-border px-3 py-2 text-[11px] tracking-wide text-muted-foreground uppercase">
        Items in this section
      </p>
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            draggable={canManage}
            onDragStart={(event) => {
              event.stopPropagation();
              setDragId(item.id);
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(event) => {
              if (!canManage || !dragId) return;
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              drop(item.id);
            }}
            className={cn(
              "flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0",
              dragId === item.id && "opacity-60",
            )}
          >
            {canManage ? (
              <GripVertical
                className="size-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[13px]">{item.label ?? item.kind}</p>
              {item.body ? <p className="text-[12px] text-muted-foreground">{item.body}</p> : null}
            </div>
            {canManage ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={item.is_visible ? "Hide item" : "Show item"}
                onClick={() =>
                  saveComponent.mutate({ id: item.id, patch: { is_visible: !item.is_visible } })
                }
              >
                {item.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-section search settings: link anchor, heading level, schema inclusion. */
function SectionSeoFields({
  section,
  organizationId,
  canManage,
}: {
  section: ContentSection;
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const saveSection = useSaveSection(organizationId);
  const [open, setOpen] = useState(false);
  const seo = readSectionSeo(section.settings);

  if (!canManage) return null;

  return (
    <div className="mt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        <Search className="size-4" /> {open ? "Hide" : "Search settings for this section"}
      </Button>
      {open ? (
        <form
          className="mt-3 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            saveSection.mutate({
              id: section.id,
              patch: {
                settings: writeSectionSeo(section.settings, {
                  anchor: String(form.get("anchor") ?? "").trim() || undefined,
                  seo_heading_level: (String(form.get("level") ?? "h2") === "h3" ? "h3" : "h2") as
                    "h2" | "h3",
                  include_in_schema: form.get("schema") === "on",
                  image_alt: String(form.get("alt") ?? "").trim() || undefined,
                }),
              },
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`anchor-${section.id}`}>Link anchor</Label>
            <Input
              id={`anchor-${section.id}`}
              name="anchor"
              defaultValue={seo.anchor ?? ""}
              placeholder="services"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`level-${section.id}`}>Heading level</Label>
            <select
              id={`level-${section.id}`}
              name="level"
              defaultValue={seo.seo_heading_level ?? "h2"}
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-[13px]"
            >
              <option value="h2">Main section (H2)</option>
              <option value="h3">Sub-section (H3)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`alt-${section.id}`}>Image description</Label>
            <Input id={`alt-${section.id}`} name="alt" defaultValue={seo.image_alt ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
            <input type="checkbox" name="schema" defaultChecked={seo.include_in_schema ?? false} />
            Include this section in search rich results
          </label>
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline" disabled={saveSection.isPending}>
              Save search settings
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** Page-level search and social preview fields. */
function PageSeoPanel({
  page,
  organizationId,
  canManage,
}: {
  page: ContentPage;
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const savePage = useSavePage(organizationId);
  const [open, setOpen] = useState(false);

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium">Search & sharing for {page.title}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {page.seo_title ? `Google shows: “${page.seo_title}”` : "No search title set yet."}
            {page.noindex ? " · Hidden from search engines" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
          <Search className="size-4" /> {open ? "Close" : "Edit"}
        </Button>
      </div>

      {open ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const patch: Record<string, unknown> = { noindex: form.get("noindex") === "on" };
            for (const field of PAGE_SEO_FIELDS) {
              patch[field.key] = String(form.get(field.key) ?? "").trim() || null;
            }
            savePage.mutate({ id: page.id, patch });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {PAGE_SEO_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`${field.key}-${page.id}`}>{field.label}</Label>
                {field.key === "seo_description" || field.key === "og_description" ? (
                  <Textarea
                    id={`${field.key}-${page.id}`}
                    name={field.key}
                    rows={2}
                    maxLength={field.max}
                    defaultValue={page[field.key] ?? ""}
                    disabled={!canManage}
                  />
                ) : (
                  <Input
                    id={`${field.key}-${page.id}`}
                    name={field.key}
                    maxLength={field.max}
                    defaultValue={page[field.key] ?? ""}
                    disabled={!canManage}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">{field.help}</p>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="noindex"
              defaultChecked={page.noindex}
              disabled={!canManage}
            />
            Hide this page from search engines
          </label>
          {canManage ? (
            <div>
              <Button type="submit" variant="outline" disabled={savePage.isPending}>
                Save search settings
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}
    </Panel>
  );
}

/** Plain-English banner explaining what a section is for and why it wins work. */
function SectionPurpose({ kind }: { kind: string }) {
  const guide = sectionGuide(kind);
  return (
    <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-3">
      <p className="text-[12px] text-muted-foreground">{guide.purpose}</p>
      <p className="mt-1.5 flex items-start gap-1.5 text-[12px] font-medium text-primary">
        <Target className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{guide.lead}</span>
      </p>
    </div>
  );
}
