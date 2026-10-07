import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Smartphone,
  Tablet,
  Tv,
  Columns2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BUILDER_VIEWPORTS,
  previewPath,
  previewZoom,
  type BuilderViewportKey,
} from "@/lib/builder-preview";
import {
  DRAFT_CHANNEL,
  PREVIEW_BRIDGE_SOURCE,
  announceDraftChange,
  readDraftPing,
  readPreviewMessage,
  type PreviewToBuilderMessage,
} from "@/lib/builder/preview-bridge";
import { saveInlineText } from "@/lib/builder/inline-edit.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { pageNavLabel, type ContentPage } from "@/lib/website-content";
import { cn } from "@/lib/utils";
import { LiveCanvasSkeleton } from "@/components/app/LiveCanvasSkeleton";

const VIEWPORT_ICONS = {
  compact: Smartphone,
  phone: Smartphone,
  tablet: Tablet,
  laptop: Monitor,
  wide: Monitor,
  ultra: Tv,
} satisfies Record<BuilderViewportKey, typeof Monitor>;

/** A block the owner clicked in the preview, handed to the assistant. */
export type PreviewSelection = Extract<PreviewToBuilderMessage, { type: "select" }>;

type BuilderPreviewProps = {
  slug: string;
  pages: ContentPage[];
  /** Used to shorten older page titles ("Services — Acme") to "Services". */
  businessName?: string | null;
  refreshing?: boolean;
  /** Increments only after saved website data has been invalidated and reloaded. */
  refreshRevision?: number;
  /** Called when the owner clicks a block while select mode is on. */
  onSelect?: (selection: PreviewSelection) => void;
  /** The block currently being discussed, outlined inside the preview. */
  selectedId?: string | null;
  /** The exact element being discussed inside that block, if one was picked. */
  selectedPath?: string | null;
  /** Live line shown on the preview while the team works ("Sol is restyling…"). */
  liveStatus?: string | null;
  /** Called after an in-place text edit was saved (to refresh caches/undo). */
  onInlineSaved?: (edit: { sectionId: string; path: string; before: string; after: string }) => void;
  /** Workspace whose build progress feeds the first-build canvas. */
  organizationId?: string | null;
  /** Nothing built yet: show the live canvas skeleton instead of an empty frame. */
  firstRun?: boolean;
};

/**
 * The builder's preview pane. It is mounted from the very first build: while
 * there are no pages yet it shows the live canvas skeleton with the real build
 * status, and it switches to the real draft frame as soon as pages are written.
 */
export function BuilderPreview({ firstRun = false, organizationId = null, ...props }: BuilderPreviewProps) {
  if (firstRun || props.pages.length === 0) {
    return <LiveCanvasSkeleton organizationId={organizationId} businessName={props.businessName ?? null} />;
  }
  return <BuilderPreviewFrame {...props} organizationId={organizationId} />;
}

function BuilderPreviewFrame({
  slug,
  pages,
  businessName = null,
  refreshing = false,
  refreshRevision = 0,
  onSelect,
  selectedId = null,
  selectedPath = null,
  liveStatus = null,
  onInlineSaved,
  organizationId = null,
}: Omit<BuilderPreviewProps, "firstRun">) {
  const ordered = useMemo(() => [...pages].sort((a, b) => a.sort_order - b.sort_order), [pages]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<BuilderViewportKey>("laptop");
  // On a phone, open the preview in phone size: it's what the owner is
  // holding, and a full desktop render inside a phone is heavy.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      const phone = BUILDER_VIEWPORTS.find((v) => v.width <= 430)?.key;
      if (phone) setViewport(phone);
    }
  }, []);
  const [zoom, setZoom] = useState(0.75);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  // Compare: the published site (what visitors see now) next to the draft
  // (what Publish would put live), so every AI change can be checked first.
  const [compare, setCompare] = useState(false);
  const [tabRevision, setTabRevision] = useState(0);
  const saveText = useServerFn(saveInlineText);
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
  // Side by side, each pane gets half the stage.
  const paneScale = compare && stageWidth > 0 ? Math.min(scale, (stageWidth - 36) / 2 / viewportWidth) : scale;

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
        { source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on, selectedId, selectedPath },
        window.location.origin,
      );
    },
    [selectedId, selectedPath],
  );

  /** Sends a message to the preview frame; silently a no-op before it loads. */
  const tell = useCallback((message: Record<string, unknown>) => {
    const frame = frameRef.current?.contentWindow;
    if (!frame || typeof window === "undefined") return;
    frame.postMessage({ source: PREVIEW_BRIDGE_SOURCE, ...message }, window.location.origin);
  }, []);

  // Live team status floats on the preview itself, over the block being worked on.
  useEffect(() => {
    tell({ type: "status", text: liveStatus ?? null, id: selectedId });
  }, [liveStatus, selectedId, tell]);

  // Another tab (or the canvas editor) changed this draft: reload this preview.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || !organizationId) return;
    const channel = new BroadcastChannel(DRAFT_CHANNEL);
    channel.onmessage = (event) => {
      const ping = readDraftPing(event.data);
      if (ping?.organizationId === organizationId) setTabRevision((value) => value + 1);
    };
    return () => channel.close();
  }, [organizationId]);

  const onInlineEdit = useCallback(
    async (edit: { id: string; path: string; text: string }) => {
      if (!organizationId) return;
      try {
        const result = await saveText({ data: { organizationId, sectionId: edit.id, path: edit.path, text: edit.text } });
        if (result.unchanged) return;
        // The preview already shows the new words; no reload needed.
        onInlineSaved?.({ sectionId: edit.id, path: edit.path, before: result.before, after: result.after });
        announceDraftChange(organizationId);
        toast.success("Saved to draft");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't save that change.");
        setRefreshKey((value) => value + 1);
      }
    },
    [onInlineSaved, organizationId, saveText],
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
        tell({ type: "status", text: liveStatus ?? null, id: selectedId });
        return;
      }
      if (message.type === "inline-edit") {
        void onInlineEdit(message);
        return;
      }
      onSelect?.(message);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [liveStatus, onInlineEdit, onSelect, selectMode, selectedId, syncSelectMode, tell]);


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
                {item.kind === "home" || item.slug === "home" ? "Home" : pageNavLabel(item.title, businessName, item.slug)}
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
          <Button
            type="button"
            size="icon-sm"
            variant={compare ? "secondary" : "ghost"}
            aria-pressed={compare}
            data-testid="builder-preview-compare"
            aria-label={compare ? "Close live vs draft compare" : "Compare live site with draft"}
            title={compare ? "Close compare" : "Live vs draft"}
            onClick={() => setCompare((value) => !value)}
          >
            <Columns2 className="size-4" aria-hidden />
          </Button>
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
        <div className={cn("flex justify-center gap-3", compare && "items-start")}>
          {compare ? (
            <PreviewFrame
              label="Live now"
              src={`/s/${encodeURIComponent(slug)}${page && page.slug !== "home" ? `/${encodeURIComponent(page.slug)}` : ""}`}
              frameKey={`live-${source}-${refreshKey}-${refreshRevision}-${tabRevision}`}
              viewportWidth={viewportWidth}
              frameHeight={frameHeight}
              scale={paneScale}
              title="Published site"
            />
          ) : null}
          <PreviewFrame
            ref={frameRef}
            label={compare ? "Draft" : null}
            src={source}
            frameKey={`${source}-${refreshKey}-${refreshRevision}-${tabRevision}`}
            viewportWidth={viewportWidth}
            frameHeight={frameHeight}
            scale={paneScale}
            title={`${page?.title ?? "Website"} preview`}
            testId="builder-preview-frame"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * One scaled device frame. The fixed-size wrapper is scaled rather than the
 * frame itself: iPhone Safari ignores width on a transformed frame and lays the
 * site out at the phone's width, leaving a narrow strip.
 */
const PreviewFrame = forwardRef<
  HTMLIFrameElement,
  { label: string | null; src: string; frameKey: string; viewportWidth: number; frameHeight: number; scale: number; title: string; testId?: string }
>(function PreviewFrame({ label, src, frameKey, viewportWidth, frameHeight, scale, title, testId }, ref) {
  return (
    <figure className="m-0 min-w-0">
      {label ? (
        <figcaption className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</figcaption>
      ) : null}
      <div
        className="overflow-hidden rounded-lg border border-border bg-background shadow-lift transition-[width,height] duration-300"
        style={{ width: Math.round(viewportWidth * scale), height: Math.round(frameHeight * scale) }}
      >
        <div className="origin-top-left" style={{ width: viewportWidth, height: frameHeight, transform: `scale(${scale})` }}>
          <iframe
            ref={ref}
            key={frameKey}
            {...(testId ? { "data-testid": testId } : {})}
            data-preview-src={src}
            title={title}
            src={src}
            loading="lazy"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            className="block border-0"
            style={{ width: viewportWidth, minWidth: viewportWidth, maxWidth: viewportWidth, height: frameHeight, backgroundColor: "#fff" }}
          />
        </div>
      </div>
    </figure>
  );
});
