/**
 * Visual builder canvas.
 *
 * A live, click-to-edit view of the selected page. Sections render as the
 * visitor will see them, clicking any element selects it, text is edited inline
 * in place, a layers panel mirrors the real page tree, sections and elements can
 * be dragged into a new order, and the right-side inspector exposes the rest of
 * the selected element's settings. A device switcher renders the same canvas at
 * phone, tablet and desktop widths.
 *
 * Everything writes through the existing content mutations, so undo/redo,
 * autosave invalidation and link-safety rules all still apply. Deleting a
 * section or an element keeps the removed row in memory so the client can put it
 * straight back.
 */
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeLinkUrl } from "@/lib/website-content";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  sectionLabel,
  type ContentComponent,
  type ContentPage,
  type ContentSection,
} from "@/lib/website-content";
import {
  useAddComponent,
  useDeleteComponent,
  useDeleteSection,
  useDuplicateComponent,
  useDuplicateSection,
  useMoveSection,
  useReorderComponents,
  useReorderSections,
  useRestoreComponent,
  useRestoreSection,
  useSaveComponent,
  useSaveSection,
} from "@/lib/website-content.hooks";
import {
  COMPONENT_LIBRARY,
  breadcrumb,
  elementLabel,
  layers,
  orderedComponents,
  orderedSections,
  reorder,
  type Selection,
  visualEditInstruction,
  visualEditSuggestions,
} from "@/lib/builder-tree";
import { cn } from "@/lib/utils";
import { askAssistant } from "@/lib/assistant-bridge";
import {
  ALIGNMENTS,
  BORDER_WIDTHS,
  BUTTON_SIZES,
  BUTTON_STYLES,
  COLUMNS,
  DEVICES,
  DEVICE_META,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  LETTER_SPACINGS,
  LINE_HEIGHTS,
  MAX_WIDTHS,
  OBJECT_FITS,
  OPACITIES,
  OVERLAYS,
  RADII,
  SHADOWS,
  SPACES,
  TEXT_SIZES,
  TEXT_TRANSFORMS,
  blockCss,
  buttonClasses,
  buttonCss,
  clearDeviceLayer,
  isOverridden,
  itemsCss,
  readBlockStyle,
  writeBlockStyle,
  FOCAL_POINTS,
  readComponentVisual,
  writeComponentVisual,
  type BlockStyle,
  type Device,
  type StyleKey,
} from "@/lib/site-style";

/** Alt text lives in the component's settings JSONB; always read it as text. */
function readAlt(settings: unknown): string {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const value = (settings as Record<string, unknown>)["alt"];
    if (typeof value === "string") return value.slice(0, 160);
  }
  return "";
}

const DEVICE_ICON: Record<Device, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

/** Where a dragged row would land relative to the row it is hovering over. */
type DropHint = { id: string; position: "before" | "after" } | null;

function dropPosition(event: React.DragEvent<HTMLElement>): "before" | "after" {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? "before" : "after";
}

/** contentEditable text that saves on blur and never injects markup. */
function InlineText({
  value,
  placeholder,
  className,
  editable,
  onCommit,
}: {
  value: string;
  placeholder: string;
  className?: string;
  editable: boolean;
  onCommit: (next: string) => void;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);

  // Keep the DOM in sync with saved data without fighting the caret while typing.
  React.useEffect(() => {
    if (ref.current && ref.current.textContent !== value) ref.current.textContent = value;
  }, [value]);

  return (
    <span
      ref={ref}
      role={editable ? "textbox" : undefined}
      tabIndex={editable ? 0 : -1}
      contentEditable={editable}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={cn(
        "block rounded outline-none",
        editable &&
          "cursor-text hover:bg-primary/5 focus:ring-1 focus:ring-primary/50 focus-visible:ring-1",
        !value && "text-muted-foreground/60 before:content-[attr(data-placeholder)]",
        className,
      )}
      onBlur={(event) => {
        const next = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          (event.currentTarget as HTMLElement).blur();
        }
        if (event.key === "Escape") {
          if (ref.current) ref.current.textContent = value;
          (event.currentTarget as HTMLElement).blur();
        }
      }}
    />
  );
}

function ItemCard({
  item,
  selected,
  editable,
  dragging,
  hint,
  onSelect,
  onCommit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  actions,
  device,
}: {
  item: ContentComponent;
  selected: boolean;
  editable: boolean;
  dragging: boolean;
  hint: "before" | "after" | null;
  onSelect: () => void;
  onCommit: (patch: Record<string, unknown>) => void;
  onDragStart: () => void;
  onDragOver: (position: "before" | "after") => void;
  onDrop: () => void;
  onDragEnd: () => void;
  actions?: React.ReactNode;
  /** Which device tier to preview this element at. */
  device: Device;
}) {
  const style = readBlockStyle(item.settings, device);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={editable}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => {
        if (!editable) return;
        event.preventDefault();
        event.stopPropagation();
        onDragOver(dropPosition(event));
      }}
      onDrop={(event) => {
        if (!editable) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect();
      }}
      style={blockCss(style)}
      className={cn(
        "relative rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/40",
        !item.is_visible && "opacity-50",
        style.hidden === true && "opacity-40 outline-1 outline-dashed outline-border",
        dragging && "opacity-40",
        hint === "before" && "ring-2 ring-primary/70 ring-offset-1",
        hint === "after" && "ring-2 ring-primary/70 ring-offset-1",
      )}
    >
      {item.media_url ? (
        <img
          src={item.media_url}
          alt={readAlt(item.settings)}
          loading="lazy"
          className="mb-2 h-28 w-full rounded-md"
          style={{ objectFit: style.objectFit ?? "cover" }}
        />
      ) : null}
      <InlineText
        value={item.label ?? ""}
        placeholder="Item title"
        editable={editable}
        className="font-medium"
        onCommit={(label) => onCommit({ label })}
      />
      <InlineText
        value={item.body ?? ""}
        placeholder="Short description"
        editable={editable}
        className="mt-1 text-[12px] leading-relaxed text-muted-foreground"
        onCommit={(body) => onCommit({ body })}
      />
      {item.link_label ? (
        <span className={cn("mt-2", buttonClasses(style))} style={buttonCss(style)}>
          {item.link_label}
        </span>
      ) : null}
      {selected && actions ? <div className="mt-2 flex flex-wrap gap-1">{actions}</div> : null}
    </div>
  );
}

import {
  discardEdit,
  hasPending,
  stageEdit,
  stagedCount,
  stagedEdits,
  stagedFieldSummary,
  withPending,
  type StagedState,
} from "@/lib/builder/staged-edit";

/**
 * Picture framing and provenance. Cropping here is non-destructive: the frame
 * shape and the focal point decide what is shown, so the original file is never
 * altered and any choice can be undone.
 */
function PictureControls({
  settings,
  disabled,
  onChange,
}: {
  settings: unknown;
  disabled: boolean;
  onChange: (patch: {
    aspect_ratio?: "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
    object_fit?: "cover" | "contain";
    focal_point?: string;
    source?: "customer" | "stock" | "generated" | "unknown";
    credit?: string;
    license?: string;
    source_url?: string;
  }) => void;
}) {
  const visual = readComponentVisual(settings);
  const focal = visual.focal_point ?? "50% 50%";
  const ratios = ["1:1", "4:3", "3:2", "16:9", "21:9"] as const;
  const sources = [
    { value: "customer", label: "Our own photo" },
    { value: "stock", label: "Stock photo" },
    { value: "generated", label: "Made by Revora" },
    { value: "unknown", label: "Not sure yet" },
  ] as const;
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-[12px] font-medium">Picture framing</p>
      <Field label="Frame shape" hint="Crops what shows without changing the file">
        <div className="flex flex-wrap gap-1.5">
          {ratios.map((ratio) => (
            <button
              key={ratio}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ aspect_ratio: ratio })}
              aria-pressed={visual.aspect_ratio === ratio}
              className={cn(
                "min-h-8 rounded-full border px-2.5 text-[11px]",
                visual.aspect_ratio === ratio
                  ? "border-primary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {ratio}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Fill the frame">
        <div className="flex gap-1.5">
          {(["cover", "contain"] as const).map((fit) => (
            <button
              key={fit}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ object_fit: fit })}
              aria-pressed={(visual.object_fit ?? "cover") === fit}
              className={cn(
                "min-h-8 rounded-full border px-2.5 text-[11px]",
                (visual.object_fit ?? "cover") === fit
                  ? "border-primary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {fit === "cover" ? "Fill the frame" : "Show all of it"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Keep this part in view" hint="Choose the part of the photo that matters most">
        <div className="grid w-fit grid-cols-3 gap-1">
          {FOCAL_POINTS.map((point) => (
            <button
              key={point.value}
              type="button"
              disabled={disabled}
              aria-label={point.label}
              aria-pressed={focal === point.value}
              onClick={() => onChange({ focal_point: point.value })}
              className={cn(
                "size-8 rounded-md border",
                focal === point.value
                  ? "border-primary bg-primary/15"
                  : "border-border hover:bg-elevated",
              )}
            >
              <span className="sr-only">{point.label}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Where this picture came from">
        <div className="flex flex-wrap gap-1.5">
          {sources.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={(visual.source ?? "unknown") === option.value}
              onClick={() => onChange({ source: option.value })}
              className={cn(
                "min-h-8 rounded-full border px-2.5 text-[11px]",
                (visual.source ?? "unknown") === option.value
                  ? "border-primary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Credit" hint="Shown under the picture when the source asks for it">
        <Input
          defaultValue={visual.credit ?? ""}
          disabled={disabled}
          onBlur={(event) => onChange({ credit: event.target.value.trim().slice(0, 120) })}
        />
      </Field>
      <Field label="Licence">
        <Input
          defaultValue={visual.license ?? ""}
          disabled={disabled}
          onBlur={(event) => onChange({ license: event.target.value.trim().slice(0, 80) })}
        />
      </Field>
      <Field label="Source link">
        <Input
          defaultValue={visual.source_url ?? ""}
          disabled={disabled}
          onBlur={(event) => onChange({ source_url: event.target.value.trim().slice(0, 500) })}
        />
      </Field>
    </div>
  );
}


export function BuilderCanvas({
  organizationId,
  pages,
  canManage,
  refreshing = false,
  onRewriteSection,
  editingMode = "visual",
}: {
  organizationId: string | undefined;
  pages: ContentPage[];
  canManage: boolean;
  refreshing?: boolean;
  /**
   * Hands the selected section to the assistant so the owner can improve just
   * that part of the page instead of describing the whole website again.
   */
  onRewriteSection?: (target: {
    pageTitle: string;
    sectionKind: string;
    sectionLabel: string;
  }) => void;
  editingMode?: "content" | "visual";
}) {
  const [pageId, setPageId] = React.useState<string | null>(null);
  const [device, setDevice] = React.useState<Device>("desktop");
  const [selection, setSelection] = React.useState<Selection>(null);
  const [showLayers, setShowLayers] = React.useState(editingMode === "visual");
  const [addKind, setAddKind] = React.useState(COMPONENT_LIBRARY[0]!.kind);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<DropHint>(null);
  const [undoable, setUndoable] = React.useState<
    { kind: "section"; row: ContentSection } | { kind: "component"; row: ContentComponent } | null
  >(null);
  /** Field edits wait here until the owner presses Apply. */
  const [staged, setStaged] = React.useState<StagedState>({});
  /** Bumped on cancel so in-place fields re-read the saved text. */
  const [editNonce, setEditNonce] = React.useState(0);

  React.useEffect(() => {
    setShowLayers(editingMode === "visual");
  }, [editingMode]);

  const saveSection = useSaveSection(organizationId);
  const saveComponent = useSaveComponent(organizationId);
  const moveSection = useMoveSection(organizationId);
  const deleteSection = useDeleteSection(organizationId);
  const reorderSections = useReorderSections(organizationId);
  const reorderComponents = useReorderComponents(organizationId);
  const duplicateSection = useDuplicateSection(organizationId);
  const restoreSection = useRestoreSection(organizationId);
  const addComponent = useAddComponent(organizationId);
  const duplicateComponent = useDuplicateComponent(organizationId);
  const deleteComponent = useDeleteComponent(organizationId);
  const restoreComponent = useRestoreComponent(organizationId);

  const ordered = React.useMemo(
    () => [...pages].sort((a, b) => a.sort_order - b.sort_order),
    [pages],
  );
  const page = ordered.find((p) => p.id === pageId) ?? ordered[0] ?? null;
  const savedSections = React.useMemo(() => (page ? orderedSections(page) : []), [page]);
  /** What the owner sees: saved content with their pending edits laid over it. */
  const sections = React.useMemo(
    () =>
      savedSections.map((section) => ({
        ...withPending(staged, "section", section),
        components: section.components.map((item) => withPending(staged, "component", item)),
      })),
    [savedSections, staged],
  );

  const stageSection = (id: string, patch: Record<string, unknown>) => {
    const savedRow = savedSections.find((s) => s.id === id);
    if (!savedRow) return;
    setStaged((current) =>
      stageEdit(current, "section", id, patch, savedRow as unknown as Record<string, unknown>),
    );
  };

  const stageComponent = (id: string, patch: Record<string, unknown>) => {
    const savedRow = savedSections
      .flatMap((section) => section.components)
      .find((item) => item.id === id);
    if (!savedRow) return;
    setStaged((current) =>
      stageEdit(current, "component", id, patch, savedRow as unknown as Record<string, unknown>),
    );
  };

  /** Writes every pending edit, then empties the buffer. */
  const applyStaged = () => {
    for (const edit of stagedEdits(staged)) {
      if (edit.kind === "section") saveSection.mutate({ id: edit.id, patch: edit.patch });
      else saveComponent.mutate({ id: edit.id, patch: edit.patch });
    }
    setStaged({});
  };

  /** Throws pending edits away and puts the saved wording back on screen. */
  const cancelStaged = () => {
    setStaged({});
    setEditNonce((value) => value + 1);
  };

  const selectedSectionId =
    selection && selection.type !== "page" ? selection.sectionId : (null as string | null);
  const selectedSection: ContentSection | null = selectedSectionId
    ? (sections.find((s) => s.id === selectedSectionId) ?? null)
    : null;
  const selectedComponent: ContentComponent | null =
    selection?.type === "component" && selectedSection
      ? (selectedSection.components.find((c) => c.id === selection.componentId) ?? null)
      : null;

  const clearDrag = () => {
    setDragId(null);
    setHint(null);
  };

  if (!page) {
    return (
      <section className="panel p-5">
        <p className="text-[13px] font-medium">Nothing to edit yet</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Build your pages first — then this canvas lets you click any headline, paragraph or card
          and edit it in place.
        </p>
      </section>
    );
  }

  const width = DEVICE_META[device].width;
  const trail = breadcrumb(page, selectedSection, selectedComponent);
  const layerNodes = layers(page);

  const move = (index: number, direction: -1 | 1) => {
    const a = sections[index];
    const b = sections[index + direction];
    if (!a || !b) return;
    moveSection.mutate({
      a: { id: a.id, sort_order: a.sort_order },
      b: { id: b.id, sort_order: b.sort_order },
    });
  };

  /** Applies a section drag, or an element drag inside its own section. */
  const commitDrag = (overId: string, position: "before" | "after") => {
    if (!dragId || dragId === overId) return clearDrag();
    const sectionIds = sections.map((s) => s.id);
    if (sectionIds.includes(dragId) && sectionIds.includes(overId)) {
      const next = reorder(sectionIds, dragId, overId, position);
      if (next !== sectionIds) reorderSections.mutate(next);
      return clearDrag();
    }
    const owner = sections.find((s) => s.components.some((c) => c.id === dragId));
    if (owner && owner.components.some((c) => c.id === overId)) {
      const ids = orderedComponents(owner).map((c) => c.id);
      const next = reorder(ids, dragId, overId, position);
      if (next !== ids) reorderComponents.mutate(next);
    }
    clearDrag();
  };

  const removeSection = (section: ContentSection) => {
    setUndoable({ kind: "section", row: section });
    deleteSection.mutate(section.id);
    setSelection(null);
  };

  const removeComponent = (component: ContentComponent) => {
    setUndoable({ kind: "component", row: component });
    deleteComponent.mutate(component);
    setSelection({ type: "section", pageId: page.id, sectionId: component.section_id });
  };

  const undo = () => {
    if (!undoable) return;
    if (undoable.kind === "section") restoreSection.mutate(undoable.row);
    else restoreComponent.mutate(undoable.row);
    setUndoable(null);
  };

  const addElement = (section: ContentSection) => {
    const preset = COMPONENT_LIBRARY.find((entry) => entry.kind === addKind);
    if (!preset) return;
    addComponent.mutate({
      sectionId: section.id,
      kind: preset.kind,
      sortOrder: section.components.length,
      values: preset.defaults ?? {},
    });
  };

  return (
    <section className="panel relative overflow-hidden p-0" aria-busy={refreshing}>
      {refreshing ? (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-center bg-background/90 px-3 py-2 text-[12px] font-medium text-foreground backdrop-blur" role="status">
          Updating your preview…
        </div>
      ) : null}
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <select
          aria-label="Page to edit"
          value={page.id}
          onChange={(event) => {
            setPageId(event.target.value);
            setSelection(null);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
        >
          {ordered.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title} (/{option.slug})
            </option>
          ))}
        </select>

        {editingMode === "visual" ? (
          <Button
            size="sm"
            variant={showLayers ? "secondary" : "outline"}
            onClick={() => setShowLayers((open) => !open)}
            aria-pressed={showLayers}
          >
            <Layers className="mr-1.5 size-3.5" aria-hidden /> Layers
          </Button>
        ) : null}

        {undoable ? (
          <Button size="sm" variant="outline" onClick={undo}>
            <Undo2 className="mr-1.5 size-3.5" aria-hidden /> Undo delete
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {DEVICES.map((option) => {
            const Icon = DEVICE_ICON[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => setDevice(option)}
                aria-pressed={device === option}
                title={`${DEVICE_META[option].label} preview`}
                className={cn(
                  "grid size-8 place-items-center rounded-md border transition-colors",
                  device === option
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </header>

      {trail.length ? (
        <nav
          aria-label="Selected element"
          className="flex flex-wrap items-center gap-1 border-b border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground"
        >
          {trail.map((crumb, index) => (
            <span key={`${crumb}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden>→</span> : null}
              <span className={index === trail.length - 1 ? "text-foreground" : undefined}>
                {crumb}
              </span>
            </span>
          ))}
        </nav>
      ) : null}

      {/* Container query, not viewport: the editor now sits in a column, so it
          splits into layers/canvas/settings only when it is genuinely wide. */}
      <div className="@container">
      <div
        className={cn(
          "grid gap-0",
          showLayers
            ? "@min-[960px]:grid-cols-[220px_1fr_300px]"
            : "@min-[760px]:grid-cols-[1fr_300px]",
        )}
      >
        {/* Layers */}
        {showLayers ? (
          <aside className="max-h-[70vh] overflow-auto border-b border-border bg-card/30 p-2 @min-[960px]:border-r @min-[960px]:border-b-0">
            <p className="px-1 pb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
              Page structure
            </p>
            {layerNodes.length === 0 ? (
              <p className="px-1 text-[12px] text-muted-foreground">No sections yet.</p>
            ) : null}
            <ul className="space-y-0.5">
              {layerNodes.map((node) => {
                const active =
                  node.selection.type === "component"
                    ? selection?.type === "component" && selection.componentId === node.id
                    : selection?.type === "section" && selection.sectionId === node.id;
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => setSelection(node.selection)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] transition-colors",
                        node.depth === 1 && "pl-5 text-muted-foreground",
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                        !node.visible && "opacity-50",
                      )}
                    >
                      <span className="truncate">{node.label}</span>
                      {node.children ? (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {node.children}
                        </span>
                      ) : null}
                      {!node.visible ? <EyeOff className="size-3" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : null}

        {/* Canvas */}
        <div
          className="max-h-[70vh] overflow-auto bg-background/40 p-4"
          onClick={() => setSelection(null)}
        >
          <div
            className="mx-auto space-y-3 transition-[max-width]"
            style={{ maxWidth: `${width}px` }}
          >
            {sections.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                This page has no sections yet. Add sections in Pages &amp; content.
              </p>
            ) : null}

            {/* Floating toolbar: the actions for whatever is selected, always in reach. */}
            {canManage && selectedSection ? (
              <div
                className="sticky top-0 z-20 -mx-1 mb-1 flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="max-w-[40%] truncate pr-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                  {selectedComponent
                    ? elementLabel(selectedComponent)
                    : sectionLabel(selectedSection.kind)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Move selection up"
                  title="Move up"
                  disabled={sections.findIndex((s) => s.id === selectedSection.id) === 0}
                  onClick={() =>
                    move(
                      sections.findIndex((s) => s.id === selectedSection.id),
                      -1,
                    )
                  }
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Move selection down"
                  title="Move down"
                  disabled={
                    sections.findIndex((s) => s.id === selectedSection.id) === sections.length - 1
                  }
                  onClick={() =>
                    move(
                      sections.findIndex((s) => s.id === selectedSection.id),
                      1,
                    )
                  }
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={
                    selectedComponent ? "Duplicate this element" : "Duplicate this section"
                  }
                  title="Duplicate"
                  onClick={() =>
                    selectedComponent
                      ? duplicateComponent.mutate(selectedComponent)
                      : duplicateSection.mutate(selectedSection)
                  }
                >
                  <Copy className="size-3.5" aria-hidden />
                </Button>
                {onRewriteSection ? (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Ask Revora to improve this section"
                    title="Improve this section"
                    onClick={() =>
                      onRewriteSection({
                        pageTitle: page.title,
                        sectionKind: selectedSection.kind,
                        sectionLabel: sectionLabel(selectedSection.kind),
                      })
                    }
                  >
                    <Wand2 className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={
                    (selectedComponent ?? selectedSection).is_visible
                      ? "Hide this from the page"
                      : "Show this on the page"
                  }
                  title={
                    (selectedComponent ?? selectedSection).is_visible
                      ? "Hide from the page"
                      : "Show on the page"
                  }
                  onClick={() =>
                    selectedComponent
                      ? stageComponent(selectedComponent.id, {
                          is_visible: !selectedComponent.is_visible,
                        })
                      : stageSection(selectedSection.id, {
                          is_visible: !selectedSection.is_visible,
                        })
                  }
                >
                  {(selectedComponent ?? selectedSection).is_visible ? (
                    <EyeOff className="size-3.5" aria-hidden />
                  ) : (
                    <Eye className="size-3.5" aria-hidden />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={selectedComponent ? "Delete this element" : "Delete this section"}
                  title="Delete"
                  onClick={() => {
                    if (selectedComponent) {
                      setUndoable({ kind: "component", row: selectedComponent });
                      deleteComponent.mutate(selectedComponent);
                      setSelection({
                        type: "section",
                        pageId: page.id,
                        sectionId: selectedSection.id,
                      });
                    } else {
                      setUndoable({ kind: "section", row: selectedSection });
                      deleteSection.mutate(selectedSection.id);
                      setSelection(null);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
                {hasPending(
                  staged,
                  selectedComponent ? "component" : "section",
                  (selectedComponent ?? selectedSection).id,
                ) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Undo the unsaved changes to this selection"
                    title="Undo unsaved changes here"
                    onClick={() => {
                      setStaged((current) =>
                        discardEdit(
                          current,
                          selectedComponent ? "component" : "section",
                          (selectedComponent ?? selectedSection).id,
                        ),
                      );
                      setEditNonce((value) => value + 1);
                    }}
                  >
                    Revert
                  </Button>
                ) : null}
                {undoable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Undo the delete"
                    onClick={() => {
                      if (undoable.kind === "section") restoreSection.mutate(undoable.row);
                      else restoreComponent.mutate(undoable.row);
                      setUndoable(null);
                    }}
                  >
                    Undo
                  </Button>
                ) : null}
              </div>
            ) : null}

            {stagedCount(staged) > 0 ? (
              <div
                className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/50 bg-card/95 px-3 py-2 backdrop-blur"
                role="status"
              >
                <span className="text-[12px] font-medium">
                  {stagedCount(staged) === 1
                    ? "1 unsaved change"
                    : `${stagedCount(staged)} unsaved changes`}
                  {stagedFieldSummary(staged) ? ` — ${stagedFieldSummary(staged)}` : ""}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Only you can see these until you apply them.
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="canvas-cancel"
                    onClick={cancelStaged}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    data-testid="canvas-apply"
                    disabled={!canManage || saveSection.isPending || saveComponent.isPending}
                    onClick={applyStaged}
                  >
                    Apply changes
                  </Button>
                </div>
              </div>
            ) : null}

            {sections.map((section, index) => {
              const isSelected = selectedSectionId === section.id;
              const sectionHint = hint?.id === section.id ? hint.position : null;
              const sectionStyle = readBlockStyle(section.settings, device);
              return (
                <div
                  key={`${section.id}-${editNonce}`}
                  role="button"
                  data-testid="canvas-section"
                  data-section-id={section.id}
                  tabIndex={0}
                  draggable={canManage}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragId(section.id);
                  }}
                  onDragOver={(event) => {
                    if (!canManage || !dragId) return;
                    event.preventDefault();
                    setHint({ id: section.id, position: dropPosition(event) });
                  }}
                  onDrop={(event) => {
                    if (!canManage) return;
                    event.preventDefault();
                    commitDrag(section.id, dropPosition(event));
                  }}
                  onDragEnd={clearDrag}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelection({ type: "section", pageId: page.id, sectionId: section.id });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      setSelection({ type: "section", pageId: page.id, sectionId: section.id });
                  }}
                  style={blockCss(sectionStyle)}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left transition-colors",
                    isSelected
                      ? "border-primary ring-1 ring-primary/40"
                      : "border-border hover:border-primary/40",
                    !section.is_visible && "opacity-50",
                    sectionStyle.hidden === true &&
                      "opacity-40 outline-1 outline-dashed outline-border",
                    dragId === section.id && "opacity-40",
                    sectionHint === "before" && "border-t-2 border-t-primary",
                    sectionHint === "after" && "border-b-2 border-b-primary",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                      {canManage ? (
                        <GripVertical className="size-3.5 cursor-grab" aria-hidden />
                      ) : null}
                      {sectionLabel(section.kind)}
                    </span>
                    {!section.is_visible ? (
                      <span className="text-[11px] text-muted-foreground">Hidden</span>
                    ) : null}
                  </div>

                  <InlineText
                    value={section.heading ?? ""}
                    placeholder="Add a headline"
                    editable={canManage}
                    className="mt-2 font-display text-[18px] leading-snug font-semibold"
                    onCommit={(heading) => stageSection(section.id, { heading })}
                  />
                  <InlineText
                    value={section.subheading ?? ""}
                    placeholder="Add a supporting line"
                    editable={canManage}
                    className="mt-1.5 text-[13px] text-muted-foreground"
                    onCommit={(subheading) => stageSection(section.id, { subheading })}
                  />
                  <InlineText
                    value={section.body ?? ""}
                    placeholder="Add body text"
                    editable={canManage}
                    className="mt-2 text-[13px] leading-relaxed"
                    onCommit={(body) => stageSection(section.id, { body })}
                  />

                  {section.components.length ? (
                    <div
                      className={cn(
                        "mt-3 grid gap-2",
                        sectionStyle.columns === null &&
                          (device === "mobile" ? "grid-cols-1" : "sm:grid-cols-2"),
                      )}
                      style={itemsCss(sectionStyle)}
                    >
                      {orderedComponents(section).map((item) => (
                        <ItemCard
                          key={`${item.id}-${editNonce}`}
                          item={item}
                          device={device}
                          editable={canManage}
                          dragging={dragId === item.id}
                          hint={hint?.id === item.id ? hint.position : null}
                          selected={
                            selection?.type === "component" && selection.componentId === item.id
                          }
                          onSelect={() =>
                            setSelection({
                              type: "component",
                              pageId: page.id,
                              sectionId: section.id,
                              componentId: item.id,
                            })
                          }
                          onCommit={(patch) => stageComponent(item.id, patch)}
                          onDragStart={() => setDragId(item.id)}
                          onDragOver={(position) => setHint({ id: item.id, position })}
                          onDrop={() => commitDrag(item.id, hint?.position ?? "after")}
                          onDragEnd={clearDrag}
                          actions={
                            canManage ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title={`Duplicate ${elementLabel(item)}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    duplicateComponent.mutate(item);
                                  }}
                                >
                                  <Copy className="size-3.5" aria-hidden />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title={item.is_visible ? "Hide element" : "Show element"}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    stageComponent(item.id, { is_visible: !item.is_visible });
                                  }}
                                >
                                  {item.is_visible ? (
                                    <EyeOff className="size-3.5" aria-hidden />
                                  ) : (
                                    <Eye className="size-3.5" aria-hidden />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Delete element"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeComponent(item);
                                  }}
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                </Button>
                              </>
                            ) : null
                          }
                        />
                      ))}
                    </div>
                  ) : null}

                  {isSelected && canManage ? (
                    <div
                      className="mt-3 flex flex-wrap items-center gap-1.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        title="Move section up"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Move section down"
                        disabled={index === sections.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Duplicate section"
                        onClick={() => duplicateSection.mutate(section)}
                      >
                        <Copy className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete section"
                        onClick={() => removeSection(section)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                      <select
                        aria-label="Element to add"
                        value={addKind}
                        onChange={(event) => setAddKind(event.target.value)}
                        className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                      >
                        {COMPONENT_LIBRARY.map((entry) => (
                          <option key={entry.kind} value={entry.kind}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" variant="secondary" onClick={() => addElement(section)}>
                        <Plus className="mr-1.5 size-3.5" aria-hidden /> Add
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inspector */}
        <aside className="border-t border-border bg-card/40 p-4 @min-[760px]:border-t-0 @min-[760px]:border-l">
          {!selectedSection ? (
            <>
              <p className="text-[13px] font-medium">Nothing selected</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Click any section or card on the canvas, or pick one from the layers list. Text
                edits happen right in place; the rest of its settings appear here.
              </p>
            </>
          ) : selectedComponent ? (
            <div className="space-y-3">
              <div>
                <p className="text-[13px] font-medium">{elementLabel(selectedComponent)}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  In {sectionLabel(selectedSection.kind)}
                </p>
                <div className="mt-2 space-y-2">
                  <Button
                    size="sm"
                    variant="signal"
                    disabled={!canManage}
                    onClick={() =>
                      askAssistant(
                        visualEditInstruction(
                          visualEditSuggestions(selectedComponent, selectedSection)[0]!,
                          page,
                          selectedSection,
                          selectedComponent,
                          device,
                        ),
                      )
                    }
                  >
                    <Wand2 className="mr-1.5 size-3.5" aria-hidden /> AI edit selected
                  </Button>
                  <div className="flex flex-wrap gap-1.5">
                    {visualEditSuggestions(selectedComponent, selectedSection).slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={!canManage}
                        onClick={() =>
                          askAssistant(
                            visualEditInstruction(
                              suggestion,
                              page,
                              selectedSection,
                              selectedComponent,
                              device,
                            ),
                          )
                        }
                        className="min-h-8 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-elevated hover:text-foreground disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Field label="Button / link text">
                <Input
                  key={`ll-${selectedComponent.id}-${editNonce}`}
                  defaultValue={selectedComponent.link_label ?? ""}
                  disabled={!canManage}
                  onBlur={(event) =>
                    event.target.value !== (selectedComponent.link_label ?? "") &&
                    stageComponent(selectedComponent.id, { link_label: event.target.value.trim() || null })
                  }
                />
              </Field>
              <Field
                label="Link target"
                hint="A page like /contact, a full https link, tel: or mailto:"
              >
                <Input
                  key={`lu-${selectedComponent.id}-${editNonce}`}
                  defaultValue={selectedComponent.link_url ?? ""}
                  disabled={!canManage}
                  onBlur={(event) =>
                    event.target.value !== (selectedComponent.link_url ?? "") &&
                    stageComponent(selectedComponent.id, { link_url: safeLinkUrl(event.target.value) })
                  }
                />
              </Field>
              <Field label="Image URL" hint="An https image link, or leave empty for no image">
                <Input
                  key={`m-${selectedComponent.id}-${editNonce}`}
                  defaultValue={selectedComponent.media_url ?? ""}
                  disabled={!canManage}
                  onBlur={(event) =>
                    event.target.value !== (selectedComponent.media_url ?? "") &&
                    stageComponent(selectedComponent.id, { media_url: event.target.value.trim() || null })
                  }
                />
              </Field>
              <Field label="Image description (alt text)">
                <Input
                  key={`alt-${selectedComponent.id}-${editNonce}`}
                  defaultValue={readAlt(selectedComponent.settings)}
                  disabled={!canManage}
                  onBlur={(event) =>
                    stageComponent(selectedComponent.id, {
                        settings: {
                          ...(selectedComponent.settings ?? {}),
                          alt: event.target.value.trim().slice(0, 160),
                        },
                      })
                  }
                />
              </Field>
              {selectedComponent.media_url ? (
                <PictureControls
                  settings={selectedComponent.settings}
                  disabled={!canManage}
                  onChange={(patch) =>
                    stageComponent(selectedComponent.id, {
                      settings: writeComponentVisual(selectedComponent.settings, patch),
                    })
                  }
                />
              ) : null}
              {editingMode === "visual" ? <StyleControls
                scope="component"
                device={device}
                settings={selectedComponent.settings}
                disabled={!canManage}
                onChange={(patch) =>
                  stageComponent(selectedComponent.id, {
                      settings: writeBlockStyle(selectedComponent.settings, patch, device),
                    })
                }
                onResetDevice={() =>
                  stageComponent(selectedComponent.id, { settings: clearDeviceLayer(selectedComponent.settings, device) })
                }
              /> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() =>
                    stageComponent(selectedComponent.id, { is_visible: !selectedComponent.is_visible })
                  }
                >
                  {selectedComponent.is_visible ? (
                    <>
                      <EyeOff className="mr-1.5 size-3.5" aria-hidden /> Hide item
                    </>
                  ) : (
                    <>
                      <Eye className="mr-1.5 size-3.5" aria-hidden /> Show item
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => duplicateComponent.mutate(selectedComponent)}
                >
                  <Copy className="mr-1.5 size-3.5" aria-hidden /> Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canManage}
                  onClick={() => removeComponent(selectedComponent)}
                >
                  <Trash2 className="mr-1.5 size-3.5" aria-hidden /> Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[13px] font-medium">
                  {sectionLabel(selectedSection.kind)} settings
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  On {page.title} (/{page.slug})
                </p>
                <div className="mt-2 space-y-2">
                  <Button
                    size="sm"
                    variant="signal"
                    disabled={!canManage}
                    onClick={() =>
                      askAssistant(
                        visualEditInstruction(
                          visualEditSuggestions(null, selectedSection)[0]!,
                          page,
                          selectedSection,
                          null,
                          device,
                        ),
                      )
                    }
                  >
                    <Wand2 className="mr-1.5 size-3.5" aria-hidden /> AI edit selected
                  </Button>
                  <div className="flex flex-wrap gap-1.5">
                    {visualEditSuggestions(null, selectedSection).slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={!canManage}
                        onClick={() =>
                          askAssistant(
                            visualEditInstruction(
                              suggestion,
                              page,
                              selectedSection,
                              null,
                              device,
                            ),
                          )
                        }
                        className="min-h-8 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-elevated hover:text-foreground disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Field label="Headline">
                <Input
                  key={`h-${selectedSection.id}-${selectedSection.heading ?? ""}`}
                  data-testid="canvas-heading-input"
                  defaultValue={selectedSection.heading ?? ""}
                  disabled={!canManage}
                  onBlur={(event) =>
                    event.target.value !== (selectedSection.heading ?? "") &&
                    stageSection(selectedSection.id, { heading: event.target.value.trim() || null })
                  }
                />
              </Field>
              <Field label="Body text">
                <Textarea
                  key={`b-${selectedSection.id}-${selectedSection.body ?? ""}`}
                  rows={4}
                  defaultValue={selectedSection.body ?? ""}
                  disabled={!canManage}
                  onBlur={(event) =>
                    event.target.value !== (selectedSection.body ?? "") &&
                    stageSection(selectedSection.id, { body: event.target.value.trim() || null })
                  }
                />
              </Field>
              {editingMode === "visual" ? <StyleControls
                scope="section"
                device={device}
                settings={selectedSection.settings}
                disabled={!canManage}
                onChange={(patch) =>
                  stageSection(selectedSection.id, { settings: writeBlockStyle(selectedSection.settings, patch, device) })
                }
                onResetDevice={() =>
                  stageSection(selectedSection.id, { settings: clearDeviceLayer(selectedSection.settings, device) })
                }
              /> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() =>
                    stageSection(selectedSection.id, { is_visible: !selectedSection.is_visible })
                  }
                >
                  {selectedSection.is_visible ? (
                    <>
                      <EyeOff className="mr-1.5 size-3.5" aria-hidden /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="mr-1.5 size-3.5" aria-hidden /> Show
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => duplicateSection.mutate(selectedSection)}
                >
                  <Copy className="mr-1.5 size-3.5" aria-hidden /> Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canManage}
                  onClick={() => removeSection(selectedSection)}
                >
                  <Trash2 className="mr-1.5 size-3.5" aria-hidden /> Remove
                </Button>
              </div>
              {undoable ? (
                <Button size="sm" variant="outline" onClick={undo}>
                  <Undo2 className="mr-1.5 size-3.5" aria-hidden /> Undo last delete
                </Button>
              ) : null}
            </div>
          )}
        </aside>
      </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * Closed-list visual controls for the selected block.
 *
 * Every control writes into the current device layer, so a client can style
 * desktop once and then tune phone or tablet without touching the other tiers.
 * A dot marks any property this device overrides, and one button clears the
 * whole device layer back to inheriting desktop.
 */
function StyleControls({
  scope,
  device,
  settings,
  disabled,
  onChange,
  onResetDevice,
}: {
  scope: "section" | "component";
  device: Device;
  settings: unknown;
  disabled: boolean;
  onChange: (patch: Partial<Record<StyleKey, unknown>>) => void;
  onResetDevice: () => void;
}) {
  const style = readBlockStyle(settings, device);
  const overridden = (key: StyleKey) => isOverridden(settings, device, key);

  const label = (text: string, key: StyleKey) => (
    <span className="flex items-center gap-1">
      {text}
      {overridden(key) ? (
        <span
          className="size-1.5 rounded-full bg-primary"
          title={`Set for ${DEVICE_META[device].label.toLowerCase()} only`}
        />
      ) : null}
    </span>
  );

  /** A closed option list. Empty value means "inherit / not set". */
  const choose = (
    text: string,
    key: StyleKey,
    options: readonly (string | number)[],
    format: (value: string | number) => string = String,
  ) => (
    <label className="block" key={key}>
      <span className="text-[12px] text-muted-foreground">{label(text, key)}</span>
      <select
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
        value={style[key] === null ? "" : String(style[key])}
        disabled={disabled}
        onChange={(event) => onChange({ [key]: event.target.value || null })}
      >
        <option value="">Default</option>
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {format(option)}
          </option>
        ))}
      </select>
    </label>
  );

  const color = (text: string, key: StyleKey) => (
    <label className="block" key={key}>
      <span className="text-[12px] text-muted-foreground">{label(text, key)}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="color"
          className="h-9 w-12 rounded-md border border-border bg-background"
          value={(style[key] as string | null) ?? "#000000"}
          disabled={disabled}
          onChange={(event) => onChange({ [key]: event.target.value })}
          aria-label={text}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || style[key] === null}
          onClick={() => onChange({ [key]: null })}
        >
          Clear
        </Button>
      </span>
    </label>
  );

  const px = (value: string | number) => `${value}px`;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium">Design · {DEVICE_META[device].label}</p>
        {device !== "desktop" ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onResetDevice}>
            Reset {DEVICE_META[device].label.toLowerCase()}
          </Button>
        ) : null}
      </div>
      {device !== "desktop" ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Changes here apply on {DEVICE_META[device].label.toLowerCase()} screens only. Anything
          left on Default follows your desktop design.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {choose("Font", "font", FONT_FAMILIES)}
        {choose("Text size", "size", TEXT_SIZES, px)}
        {choose("Weight", "weight", FONT_WEIGHTS)}
        {choose("Alignment", "align", ALIGNMENTS)}
        {choose("Line height", "lineHeight", LINE_HEIGHTS)}
        {choose("Letter spacing", "letterSpacing", LETTER_SPACINGS, (v) => `${v}em`)}
        {choose("Capitalisation", "textTransform", TEXT_TRANSFORMS)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {color("Text colour", "textColor")}
        {color("Background", "bgColor")}
        {scope === "component" ? color("Button text", "buttonTextColor") : null}
        {scope === "component" ? color("Button fill", "buttonBgColor") : null}
        {color("Border colour", "borderColor")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {choose("Space above", "padTop", SPACES, px)}
        {choose("Space below", "padBottom", SPACES, px)}
        {choose("Space left", "padLeft", SPACES, px)}
        {choose("Space right", "padRight", SPACES, px)}
        {choose("Gap before block", "marginTop", SPACES, px)}
        {choose("Gap after block", "marginBottom", SPACES, px)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {scope === "section" ? choose("Columns", "columns", COLUMNS) : null}
        {scope === "section" ? choose("Column gap", "gap", SPACES, px) : null}
        {scope === "section" ? choose("Content width", "maxWidth", MAX_WIDTHS, px) : null}
        {scope === "section" ? choose("Content position", "contentAlign", ALIGNMENTS) : null}
        {choose("Corner rounding", "radius", RADII, (v) => (v === 999 ? "Pill" : `${v}px`))}
        {choose("Border width", "borderWidth", BORDER_WIDTHS, px)}
        {choose("Shadow", "shadow", SHADOWS)}
        {choose("Opacity", "opacity", OPACITIES, (v) => `${v}%`)}
        {scope === "section"
          ? choose("Image darkening", "overlay", OVERLAYS, (v) => `${v}%`)
          : null}
        {scope === "component" ? choose("Image fit", "objectFit", OBJECT_FITS) : null}
        {scope === "component" ? choose("Button style", "buttonStyle", BUTTON_STYLES) : null}
        {scope === "component" ? choose("Button size", "buttonSize", BUTTON_SIZES) : null}
      </div>

      {scope === "section" ? (
        <Field label="Background image" hint="An https image link; leave empty for none">
          <Input
            key={`bg-${style.bgImage ?? ""}`}
            defaultValue={style.bgImage ?? ""}
            disabled={disabled}
            onBlur={(event) => onChange({ bgImage: event.target.value.trim() || null })}
          />
        </Field>
      ) : null}

      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={style.hidden === true}
          disabled={disabled}
          onChange={(event) => onChange({ hidden: event.target.checked ? true : null })}
        />
        {label(`Hide on ${DEVICE_META[device].label.toLowerCase()}`, "hidden")}
      </label>
    </div>
  );
}
