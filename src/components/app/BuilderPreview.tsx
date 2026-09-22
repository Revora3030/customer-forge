import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BUILDER_VIEWPORTS,
  previewPath,
  previewZoom,
  type BuilderViewportKey,
} from "@/lib/builder-preview";
import {
  PREVIEW_BRIDGE_SOURCE,
  readPreviewMessage,
  type PreviewToBuilderMessage,
} from "@/lib/builder/preview-bridge";
import type { ContentPage } from "@/lib/website-content";
import { cn } from "@/lib/utils";

const VIEWPORT_ICONS = {
  phone: Smartphone,
  tablet: Tablet,
  laptop: Monitor,
  wide: Monitor,
} satisfies Record<BuilderViewportKey, typeof Monitor>;

/** A block the owner clicked in the preview, handed to the assistant. */
export type PreviewSelection = Extract<PreviewToBuilderMessage, { type: "select" }>;

export function BuilderPreview({
  slug,
  pages,
  refreshing = false,
  onSelect,
  selectedId = null,
}: {
  slug: string;
  pages: ContentPage[];
  refreshing?: boolean;
  /** Called when the owner clicks a block while select mode is on. */
  onSelect?: (selection: PreviewSelection) => void;
  /** The block currently being discussed, outlined inside the preview. */
  selectedId?: string | null;
}) {
  const ordered = useMemo(() => [...pages].sort((a, b) => a.sort_order - b.sort_order), [pages]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<BuilderViewportKey>("laptop");
  const [zoom, setZoom] = useState(0.75);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const page = ordered.find((item) => item.id === pageId) ?? ordered[0];
  const viewportWidth = BUILDER_VIEWPORTS.find((item) => item.key === viewport)?.width ?? 1280;
  const source = page ? previewPath(slug, page.slug) : previewPath(slug, "home");

  useEffect(() => {
    if (!fullscreen || typeof document === "undefined") return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  /** Tells the preview whether clicking should pick a block, and which is picked. */
  const syncSelectMode = useCallback(
    (on: boolean) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || typeof window === "undefined") return;
      frame.postMessage(
        { source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on, selectedId },
        window.location.origin,
      );
    },
    [selectedId],
  );

  useEffect(() => {
    syncSelectMode(selectMode);
  }, [selectMode, syncSelectMode]);

  // Clicks inside the preview arrive as messages. Only this app's own frame,
  // on this origin, is ever listened to.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = readPreviewMessage(event.data);
      if (!message) return;
      if (message.type === "ready") {
        syncSelectMode(selectMode);
        return;
      }
      onSelect?.(message);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelect, selectMode, syncSelectMode]);


  return (
    <section
      className={cn(
        "panel flex min-h-0 flex-col overflow-hidden p-0",
        fullscreen && "fixed inset-0 z-50 rounded-none bg-background",
      )}
      aria-label="Live website preview"
      data-testid="builder-preview"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card/80 p-2.5 backdrop-blur">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <nav aria-label="Preview pages" className="flex min-w-max items-center gap-1">
            {ordered.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={item.id === page?.id ? "secondary" : "ghost"}
                data-testid="builder-preview-page"
                aria-current={item.id === page?.id ? "page" : undefined}
                onClick={() => setPageId(item.id)}
                className="shrink-0"
              >
                {item.title}
              </Button>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {BUILDER_VIEWPORTS.map((option) => {
            const Icon = VIEWPORT_ICONS[option.key];
            return (
              <Button
                key={option.key}
                type="button"
                size="icon-sm"
                variant={viewport === option.key ? "secondary" : "ghost"}
                aria-label={`${option.label} preview, ${option.width} pixels`}
                aria-pressed={viewport === option.key}
                title={`${option.label} · ${option.width}px`}
                onClick={() => setViewport(option.key)}
              >
                <Icon className="size-4" aria-hidden />
              </Button>
            );
          })}
          <select
            aria-label="Preview zoom"
            value={zoom}
            onChange={(event) => setZoom(previewZoom(Number(event.target.value)))}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
          >
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </select>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh preview"
            title="Refresh preview"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
          <Button asChild size="icon-sm" variant="ghost">
            <a href={source} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab" title="Open in new tab">
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={fullscreen ? "Exit fullscreen preview" : "Open fullscreen preview"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </Button>
        </div>
      </header>

      <div className="relative min-h-[560px] flex-1 overflow-auto bg-elevated p-3 sm:min-h-[680px]">
        {refreshing ? (
          <div className="absolute inset-x-3 top-3 z-10 rounded-md border border-border bg-background/90 px-3 py-2 text-center text-[12px] font-medium backdrop-blur" role="status">
            Updating your preview…
          </div>
        ) : null}
        <div
          className="mx-auto overflow-hidden rounded-md border border-border bg-background shadow-lift transition-[width,height] duration-300"
          style={{ width: viewportWidth * zoom, height: 760 * zoom }}
        >
          <iframe
            ref={frameRef}
            key={`${source}-${refreshKey}-${refreshing ? "updating" : "ready"}`}
            data-testid="builder-preview-frame"
            data-preview-src={source}
            title={`${page?.title ?? "Website"} preview`}
            src={source}
            className="origin-top-left border-0 bg-background"
            style={{ width: viewportWidth, height: 760, transform: `scale(${zoom})` }}
          />
        </div>
      </div>
    </section>
  );
}