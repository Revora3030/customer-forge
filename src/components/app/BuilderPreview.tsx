import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type Ref, type RefObject } from "react";
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
  SplitSquareHorizontal,
  TriangleAlert,
  Accessibility,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BUILDER_VIEWPORTS,
  compareScale,
  draftDiffLabel,
  fitZoom,
  nextCompareMode,
  previewPath,
  previewZoom,
  type BuilderViewportKey,
  type CompareMode,
} from "@/lib/builder-preview";
import { getDraftDiff } from "@/lib/draft-diff.functions";
import { useQuery } from "@tanstack/react-query";
import {
  DRAFT_CHANNEL,
  PREVIEW_BRIDGE_SOURCE,
  announceDraftChange,
  readDraftPing,
  readPreviewMessage,
  type A11yIssue,
  type PreviewToBuilderMessage,
} from "@/lib/builder/preview-bridge";
import { saveInlineText } from "@/lib/builder/inline-edit.functions";
import { splitForKey, splitForPointer } from "@/lib/builder/compare-slider";
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
  const [compareMode, setCompareMode] = useState<CompareMode>("off");
  const compare = compareMode !== "off";
  const [overlaySplit, setOverlaySplit] = useState(50);
  const [fitMode, setFitMode] = useState(false);
  const [overflow, setOverflow] = useState<{ width: number; scrollWidth: number; culprits: string[] } | null>(null);
  const [a11y, setA11y] = useState<{ issueCount: number; issues: A11yIssue[] } | null>(null);
  const [a11yOpen, setA11yOpen] = useState(false);

  const [tabRevision, setTabRevision] = useState(0);
  const saveText = useServerFn(saveInlineText);
  const loadDiff = useServerFn(getDraftDiff);
  const diff = useQuery({
    queryKey: ["draft-diff", organizationId, refreshRevision, tabRevision],
    enabled: compare && Boolean(organizationId),
    queryFn: () => loadDiff({ data: { organizationId: organizationId! } }),
    staleTime: 15_000,
  });
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
  const fitted = fitMode ? fitZoom(stageWidth, viewportWidth) : scale;
  const paneScale = compareScale(compareMode, fitted, stageWidth, viewportWidth);

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

  // A new page, device size or reload re-measures overflow and contrast.
  useEffect(() => {
    setOverflow(null);
    setA11y(null);
  }, [source, viewportWidth, refreshKey, refreshRevision, tabRevision]);
  const runA11y = useCallback(() => tell({ type: "run-a11y-check" }), [tell]);

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
        // Contrast is checked once the page has painted its fonts and colours.
        window.setTimeout(runA11y, 900);
        syncSelectMode(selectMode);
        tell({ type: "status", text: liveStatus ?? null, id: selectedId });
        return;
      }
      if (message.type === "inline-edit") {
        void onInlineEdit(message);
        return;
      }
      if (message.type === "overflow") {
        setOverflow(message.overflow ? { width: message.clientWidth, scrollWidth: message.scrollWidth, culprits: message.culprits } : null);
        return;
      }
      if (message.type === "a11y-report") {
        setA11y({ issueCount: message.issueCount, issues: message.issues });
        return;
      }
      onSelect?.(message);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [liveStatus, onInlineEdit, onSelect, runA11y, selectMode, selectedId, syncSelectMode, tell]);


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
            data-compare-mode={compareMode}
            aria-label={
              compareMode === "off" ? "Compare live site with draft side by side" : compareMode === "side" ? "Switch to overlay split compare" : "Close live vs draft compare"
            }
            title={compareMode === "off" ? "Live vs draft" : compareMode === "side" ? "Overlay split" : "Close compare"}
            onClick={() => setCompareMode((mode) => nextCompareMode(mode))}
          >
            {compareMode === "overlay" ? <SplitSquareHorizontal className="size-4" aria-hidden /> : <Columns2 className="size-4" aria-hidden />}
          </Button>
          <select
            aria-label="Preview zoom"
            value={fitMode ? "fit" : zoom}
            onChange={(event) => {
              if (event.target.value === "fit") return setFitMode(true);
              setFitMode(false);
              setZoom(previewZoom(Number(event.target.value)));
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
          >
            <option value="fit">Fit</option>
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
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 text-[11.5px]" data-testid="builder-preview-status">
          <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 tnum text-muted-foreground">{viewportWidth}px</span>
          {overflow ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300"
              data-testid="builder-preview-overflow"
              title={overflow.culprits.length ? `Sticking out: ${overflow.culprits.join(" · ")}` : undefined}
            >
              <TriangleAlert className="size-3" aria-hidden />
              Horizontal scroll detected at {viewportWidth}px
            </span>
          ) : null}
          {a11y ? (
            <button
              type="button"
              onClick={() => (a11y.issueCount ? setA11yOpen((open) => !open) : runA11y())}
              data-testid="builder-preview-a11y"
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                a11y.issueCount ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
              aria-expanded={a11y.issueCount ? a11yOpen : undefined}
            >
              <Accessibility className="size-3" aria-hidden />
              {a11y.issueCount ? `${a11y.issueCount} low-contrast item${a11y.issueCount === 1 ? "" : "s"}` : "AA Pass"}
            </button>
          ) : null}
          {compare ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-foreground" data-testid="builder-preview-diff">
              {diff.isLoading ? "Comparing…" : draftDiffLabel(diff.data?.diff ?? null)}
            </span>
          ) : null}
        </div>
        {a11yOpen && a11y?.issueCount ? (
          <ul className="mx-auto mb-2 max-w-xl space-y-1 rounded-lg border border-border bg-background/95 p-2 text-[12px]" data-testid="builder-preview-a11y-list">
            {a11y.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.path}-${index}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">“{issue.text}”</span>
                <span className="shrink-0 tnum text-muted-foreground">
                  {issue.ratio}:1 · needs {issue.required}:1
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {compareMode === "overlay" ? (
          <OverlayCompare
            liveSrc={`/s/${encodeURIComponent(slug)}${page && page.slug !== "home" ? `/${encodeURIComponent(page.slug)}` : ""}`}
            frameKey={`${source}-${refreshKey}-${refreshRevision}-${tabRevision}`}
            draftRef={frameRef}
            draftSrc={source}
            viewportWidth={viewportWidth}
            frameHeight={frameHeight}
            scale={paneScale}
            split={overlaySplit}
            onSplit={setOverlaySplit}
            title={`${page?.title ?? "Website"} preview`}
          />
        ) : (
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
        )}
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

/**
 * Overlay split compare: the published site and the draft sit in the same
 * frame; a draggable divider reveals "Live" on the left and "Draft" on the
 * right. Arrow keys move it in 5% steps.
 */
function OverlayCompare({
  liveSrc,
  draftSrc,
  draftRef,
  frameKey,
  viewportWidth,
  frameHeight,
  scale,
  split,
  onSplit,
  title,
}: {
  liveSrc: string;
  draftSrc: string;
  draftRef: RefObject<HTMLIFrameElement | null>;
  frameKey: string;
  viewportWidth: number;
  frameHeight: number;
  scale: number;
  split: number;
  onSplit: (value: number) => void;
  title: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const width = Math.round(viewportWidth * scale);
  const height = Math.round(frameHeight * scale);
  const moveTo = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) onSplit(splitForPointer(clientX, rect.left, rect.width));
  };
  const frame = (src: string, key: string, ref?: Ref<HTMLIFrameElement>, testId?: string) => (
    <div className="absolute inset-0 origin-top-left" style={{ width: viewportWidth, height: frameHeight, transform: `scale(${scale})` }}>
      <iframe
        ref={ref}
        key={key}
        {...(testId ? { "data-testid": testId } : {})}
        data-preview-src={src}
        title={testId ? title : "Published site"}
        src={src}
        loading="lazy"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        className="block border-0"
        style={{ width: viewportWidth, height: frameHeight, backgroundColor: "#fff" }}
      />
    </div>
  );
  return (
    <div className="flex justify-center">
      <div
        ref={boxRef}
        data-testid="builder-preview-overlay"
        className="relative overflow-hidden rounded-lg border border-border bg-background shadow-lift"
        style={{ width, height }}
        onPointerMove={(event) => {
          if (dragging) moveTo(event.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      >
        {frame(draftSrc, `draft-${frameKey}`, draftRef, "builder-preview-frame")}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          {frame(liveSrc, `live-${frameKey}`)}
        </div>
        {/* While dragging, a transparent shield stops the frames swallowing pointer moves. */}
        {dragging ? <div className="absolute inset-0 z-10" /> : null}
        <span className="pointer-events-none absolute top-2 left-2 z-20 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">Live</span>
        <span className="pointer-events-none absolute top-2 right-2 z-20 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">Draft</span>
        <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]" style={{ left: `${split}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Live versus draft split"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          aria-valuetext={`${Math.round(split)}% live, ${100 - Math.round(split)}% draft`}
          className="absolute top-1/2 z-30 grid size-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none place-items-center rounded-full border-2 border-white bg-black/55 text-white backdrop-blur focus-visible:outline-3 focus-visible:outline-white"
          style={{ left: `${split}%` }}
          onPointerDown={(event) => {
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragging) moveTo(event.clientX);
          }}
          onPointerUp={() => setDragging(false)}
          onKeyDown={(event) => {
            const next = splitForKey(event.key, split);
            if (next === null) return;
            event.preventDefault();
            onSplit(next);
          }}
        >
          <span aria-hidden className="text-[13px] leading-none">⇆</span>
        </div>
      </div>
    </div>
  );
}

