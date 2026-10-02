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

type PreviewSessionState = {
  pageId: string | null;
  viewport: BuilderViewportKey;
  zoom: number;
};

const previewSessionKey = (organizationId: string) => `revora.builder.preview.${organizationId}`;

export function readPreviewSession(organizationId: string | null): PreviewSessionState | null {
  if (!organizationId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(previewSessionKey(organizationId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const viewport =
      typeof value.viewport === "string" &&
      ["phone", "tablet", "laptop", "wide"].includes(value.viewport)
        ? (value.viewport as BuilderViewportKey)
        : null;
    const zoom =
      typeof value.zoom === "number" && Number.isFinite(value.zoom)
        ? Math.max(0.35, Math.min(1, value.zoom))
        : null;
    const pageId = typeof value.pageId === "string" ? value.pageId : null;
    return viewport && zoom !== null ? { pageId, viewport, zoom } : null;
  } catch {
    return null;
  }
}

function writePreviewSession(organizationId: string | null, state: PreviewSessionState): void {
  if (!organizationId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(previewSessionKey(organizationId), JSON.stringify(state));
  } catch {
    /* session storage may be unavailable */
  }
}

/** A block the owner clicked in the preview, handed to the assistant. */
export type PreviewSelection = Extract<PreviewToBuilderMessage, { type: "select" }> & {
  viewport: BuilderViewportKey;
  pageSlug: string;
};

export function BuilderPreview({
  slug,
  pages,
  organizationId = null,
  refreshing = false,
  refreshRevision = 0,
  onSelect,
  selectedId = null,
}: {
  slug: string;
  pages: ContentPage[];
  organizationId?: string | null;
  refreshing?: boolean;
  /** Increments only after saved website data has been invalidated and reloaded. */
  refreshRevision?: number;
  /** Called when the owner clicks a block while select mode is on. */
  onSelect?: (selection: PreviewSelection) => void;
  /** The block currently being discussed, outlined inside the preview. */
  selectedId?: string | null;
}) {
  const ordered = useMemo(() => [...pages].sort((a, b) => a.sort_order - b.sort_order), [pages]);
  const cachedPreview = readPreviewSession(organizationId);
  const [pageId, setPageId] = useState<string | null>(cachedPreview?.pageId ?? null);
  const [viewport, setViewport] = useState<BuilderViewportKey>(cachedPreview?.viewport ?? "laptop");
  // On a phone, open the preview in phone size: it's what the owner is
  // holding, and a full desktop render inside a phone is heavy.
  useEffect(() => {
    if (cachedPreview?.viewport) return;
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      const phone = BUILDER_VIEWPORTS.find((v) => v.width <= 430)?.key;
      if (phone) setViewport(phone);
    }
  }, [organizationId]);
  const [zoom, setZoom] = useState(cachedPreview?.zoom ?? 0.75);
  useEffect(() => {
    if (!organizationId) return;
    writePreviewSession(organizationId, { pageId, viewport, zoom });
  }, [organizationId, pageId, viewport, zoom]);
  useEffect(() => {
    if (!ordered.length) {
      setPageId(null);
      return;
    }
    if (!pageId || !ordered.some((item) => item.id === pageId)) {
      setPageId(ordered[0]?.id ?? null);
    }
  }, [ordered, pageId]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setStageWidth(entry?.contentRect.width ?? 0);
      setStageHeight(entry?.contentRect.height ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const page = ordered.find((item) => item.id === pageId) ?? ordered[0];
  const viewportWidth = BUILDER_VIEWPORTS.find((item) => item.key === viewport)?.width ?? 1280;
  // Fit the chosen device to the space available, so a phone view fills the
  // frame instead of shrinking into a corner; the zoom picker still caps it.
  const fit = stageWidth > 0 ? (stageWidth - 24) / viewportWidth : zoom;
  // On mobile, use scale 1 when the viewport is phone-sized and the stage
  // is wide enough — avoids the half-screen black box from transform scaling.
  const scale = viewportWidth <= 834
    ? (stageWidth > 0 ? Math.min(1, fit) : Math.min(1, zoom))
    : Math.min(zoom, fit);
  // Fill the visible stage height, like a real browser window, instead of a
  // short fixed box that leaves empty space below the site.
  // Capped: an uncapped tall desktop frame shrunk onto a phone uses enough
  // memory to crash iPhone Safari ("A problem repeatedly occurred").
  // Mobile gets an even tighter cap: iPhone Safari crashes above ~900px of
  // rendered content inside a transformed iframe at scale < 0.5.
  const mobileCap = typeof window !== "undefined" && window.innerWidth < 768 ? 900 : 1200;
  const frameHeight = Math.min(mobileCap, Math.max(640, stageHeight > 0 ? Math.round((stageHeight - 24) / Math.max(scale, 0.25)) : 760));
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
      onSelect?.({
        ...message,
        viewport,
        pageSlug: page?.slug ?? "home",
      });
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
          {onSelect ? (
            <Button
              type="button"
              size="icon-sm"
              variant={selectMode ? "secondary" : "ghost"}
              aria-pressed={selectMode}
              data-testid="builder-preview-select"
              aria-label={selectMode ? "Stop picking a part of the page" : "Pick a part of the page"}
              title={selectMode ? "Stop picking" : "Click a part of the page to change it"}
              onClick={() => setSelectMode((value) => !value)}
            >
              <MousePointerClick className="size-4" aria-hidden />
            </Button>
          ) : null}
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

      <div ref={stageRef} className="relative min-h-[560px] flex-1 overflow-auto overscroll-contain bg-elevated p-3 sm:min-h-[680px]">
        {refreshing ? (
          <div className="absolute inset-x-3 top-3 z-10 rounded-md border border-border bg-background/90 px-3 py-2 text-center text-[12px] font-medium backdrop-blur" role="status">
            Updating your preview…
          </div>
        ) : null}
        <div
          className="mx-auto overflow-hidden rounded-lg border border-border bg-background shadow-lift transition-[width,height] duration-300"
          style={{ width: Math.round(viewportWidth * scale), height: Math.round(frameHeight * scale) }}
        >
          {/* Scale a fixed-size wrapper rather than the frame itself: iPhone
              Safari ignores width on a transformed frame and lays the site
              out at the phone's width, leaving a narrow strip. */}
          <div
            className="origin-top-left"
            style={{ width: viewportWidth, height: frameHeight, transform: `scale(${scale})` }}
          >
            <iframe
              ref={frameRef}
              key={`${source}-${refreshKey}-${refreshRevision}`}
              data-testid="builder-preview-frame"
              data-preview-src={source}
              title={`${page?.title ?? "Website"} preview`}
              src={source}
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              className="block border-0"
              style={{ width: viewportWidth, minWidth: viewportWidth, maxWidth: viewportWidth, height: frameHeight, backgroundColor: "#fff" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}