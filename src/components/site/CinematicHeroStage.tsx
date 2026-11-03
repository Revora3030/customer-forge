/**
 * Renders a validated `cinematic_hero_stage` (see lib/builder/cinematic-hero-stage.ts).
 *
 * - SSR-safe: the server paints the stage at scroll progress 0 with the real
 *   copy in a semantic heading, so it reads and indexes without JavaScript.
 * - Scrubs follow the scroll after hydration; styles are written directly to
 *   the layer elements inside one rAF per scroll, never through React state.
 * - Reduced motion: no scroll listener and no CSS animation; "static-poster"
 *   shows the first frame with any traced path fully drawn, "instant-reveal"
 *   shows the end state.
 * - will-change only on the stage's animated layers (≤ maxPromotedLayers),
 *   and only while the stage is near the viewport.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CinematicHeroStage as Stage, HeroStageLayerSpec } from "@/lib/builder/cinematic-hero-stage";
import { HERO_STAGE_CSS, promotedForStage, stageCss, stageFrame, tokenColor, type LayerFrameState } from "@/lib/builder/hero-stage-motion";
import { scrubProgress, scrubTime, shouldSeek } from "@/lib/builder/scrub";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

/** A picture the renderer resolved for one frame or media layer. */
export type HeroStagePicture = { src: string; alt: string; objectPosition?: string };

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const frameStyle = (state: LayerFrameState | undefined): CSSProperties => ({
  ...(state?.transform ? { transform: state.transform } : {}),
  ...(state?.opacity != null ? { opacity: state.opacity } : {}),
  ...(state?.clipPath ? { clipPath: state.clipPath } : {}),
});

function emphasise(text: string, emphasis: Stage["lockup"]["headline"]["emphasis"]): ReactNode {
  if (!emphasis.length) return text;
  const words = new Map(emphasis.map((e) => [e.word.toLowerCase(), e.effect]));
  return text.split(/(\s+)/).map((part, i) => {
    const effect = words.get(part.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase());
    return effect && effect !== "none" ? <em key={i} className="rv-hs-em" data-effect={effect}>{part}</em> : part;
  });
}

export function CinematicHeroStage({
  props, stage, pictures, href, headingLevel = 1,
}: {
  props: NodeProps;
  stage: Stage;
  /** Resolved pictures by layer id (media_stack: one per frame, in order; media_single: one). */
  pictures: Record<string, HeroStagePicture[]>;
  href: (h: string) => string;
  headingLevel?: 1 | 2 | 3 | 4;
}) {
  const root = useRef<HTMLDivElement>(null);
  const layers = useRef(new Map<string, HTMLElement>());
  const [still, setStill] = useState(false);
  const promoted = useMemo(() => promotedForStage(stage), [stage]);
  const stillProgress = stage.a11y.reducedMotion === "instant-reveal" ? 1 : 0;
  const first = useMemo(
    () => stageFrame(stage, still ? stillProgress : 0, { drawPaths: still && stage.a11y.reducedMotion === "static-poster" }),
    [stage, still, stillProgress],
  );

  useEffect(() => {
    if (reducedMotion()) {
      setStill(true);
      return;
    }
    const el = root.current;
    if (!el || !stage.motion.scrubs.length && !stage.layers.some((l) => l.type === "media_stack" || l.type === "rule_path")) return;
    let raf = 0;
    let near = false;
    const apply = () => {
      raf = 0;
      const box = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = stage.stage.pin.enabled ? scrubProgress(box.top, box.height, vh) : Math.min(Math.max(-box.top / Math.max(box.height, 1), 0), 1);
      const frame = stageFrame(stage, progress);
      for (const layer of stage.layers) {
        const node = layers.current.get(layer.id);
        const state = frame[layer.id];
        if (!node || !state) continue;
        if (state.transform != null) node.style.transform = state.transform;
        if (state.opacity != null) node.style.opacity = String(state.opacity);
        if (state.clipPath != null) node.style.clipPath = state.clipPath;
        node.style.willChange = near && promoted.has(layer.id) ? "transform, opacity" : "";
        if (state.dashOffset != null) {
          const path = node.querySelector("path");
          if (path) path.style.strokeDashoffset = String(state.dashOffset);
        }
        if (state.frames) {
          const imgs = node.querySelectorAll<HTMLElement>("[data-hs-frame]");
          state.frames.forEach((opacity, i) => {
            const img = imgs[i];
            if (!img) return;
            img.style.opacity = String(opacity);
            // promotedWindow 3: only the incoming frame is promoted.
            img.style.willChange = near && opacity > 0 && opacity < 1 ? "opacity" : "";
          });
        }
        if (state.playhead != null) {
          const video = node.querySelector("video");
          if (video && Number.isFinite(video.duration)) {
            const target = scrubTime(state.playhead, video.duration);
            if (shouldSeek(video.currentTime, target)) video.currentTime = target;
          }
        }
      }
    };
    const onScroll = () => { if (near && !raf) raf = window.requestAnimationFrame(apply); };
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { near = Boolean(entry?.isIntersecting); onScroll(); }, { rootMargin: "25% 0px" })
      : null;
    if (io) io.observe(el);
    else near = true;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    apply();
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [stage, promoted]);

  const keep = (id: string) => (node: HTMLElement | null) => {
    if (node) layers.current.set(id, node);
    else layers.current.delete(id);
  };
  const hasMedia = stage.layers.some((l) => (l.type === "media_stack" || l.type === "media_single") && (pictures[l.id]?.length ?? 0) > 0);
  const { lockup } = stage;
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4";
  const headline = lockup.headline.lines?.length
    ? lockup.headline.lines.map((line, i) => <span key={i} className="rv-hs-line">{emphasise(line, lockup.headline.emphasis)}</span>)
    : emphasise(lockup.headline.text, lockup.headline.emphasis);

  return (
    <div
      ref={root}
      {...props}
      className={[props.className, "rv-hs"].filter(Boolean).join(" ")}
      style={{ ...props.style, ["--hs-measure" as string]: `${lockup.maxWidthCh}ch` }}
      data-hs={stage.id}
      data-pin={stage.stage.pin.enabled ? stage.stage.pin.distance : undefined}
      data-ink={hasMedia ? "light" : undefined}
      data-still={still ? "" : undefined}
    >
      <style href="rv-hs-shared" precedence="rv-cn">{HERO_STAGE_CSS}</style>
      <style>{stageCss(stage)}</style>
      <div className="rv-hs-stage">
        {stage.layers.map((layer, z) => renderLayer(layer, z, first[layer.id], pictures[layer.id] ?? [], keep(layer.id), still))}
        <div className="rv-hs-lockup">
          {lockup.eyebrow ? <p className="rv-hs-eyebrow" data-hs-reveal="eyebrow">{lockup.eyebrow.text}</p> : null}
          <Heading className="rv-hs-headline" data-hs-reveal="headline">{headline}</Heading>
          {lockup.sub ? <p className="rv-hs-sub" data-hs-reveal="sub">{lockup.sub.text}</p> : null}
          {lockup.cta ? <a className="rv-hs-cta" data-hs-reveal="cta" href={href(lockup.cta.href)}>{lockup.cta.label}</a> : null}
        </div>
      </div>
    </div>
  );
}

function renderLayer(layer: HeroStageLayerSpec, z: number, state: LayerFrameState | undefined, pictures: HeroStagePicture[], ref: (node: HTMLElement | null) => void, still: boolean): ReactNode {
  const base = { ref, "data-hs-layer": layer.id, className: "rv-hs-layer", "aria-hidden": true as const, style: { zIndex: z, ...frameStyle(state) } };
  switch (layer.type) {
    case "media_stack": {
      if (!pictures.length) return null;
      const opacities = state?.frames ?? pictures.map((_, i) => (i === 0 ? 1 : 0));
      return (
        <div key={layer.id} {...base} aria-hidden={undefined}>
          {pictures.map((pic, i) => (
            <img
              key={`${i}-${pic.src}`}
              data-hs-frame=""
              src={pic.src}
              alt={i === 0 ? pic.alt : ""}
              aria-hidden={i === 0 ? undefined : true}
              loading={i < 3 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              decoding="async"
              style={{ opacity: opacities[i] ?? 0, ...(pic.objectPosition ? { objectPosition: pic.objectPosition } : {}) }}
            />
          ))}
        </div>
      );
    }
    case "media_single": {
      const pic = pictures[0];
      if (!pic) return null;
      const fit = { objectFit: layer.objectFit, ...(pic.objectPosition ? { objectPosition: pic.objectPosition } : {}) } as CSSProperties;
      return (
        <div key={layer.id} {...base} aria-hidden={undefined}>
          {layer.kind === "video" ? (
            <video src={pic.src} poster={pictures[1]?.src} muted playsInline loop={!layer.scrubVideo} autoPlay={!layer.scrubVideo && !still} preload="metadata" aria-label={pic.alt} style={fit} />
          ) : (
            <img src={pic.src} alt={pic.alt} loading="eager" fetchPriority="high" decoding="async" style={fit} />
          )}
        </div>
      );
    }
    case "ambient":
      return <div key={layer.id} {...base}><div className="rv-hs-drift" /></div>;
    case "light_sweep":
      return <div key={layer.id} {...base} data-blend={layer.mask === "image-luminance" ? "overlay" : undefined}><div className="rv-hs-band" /></div>;
    case "rule_path":
      return (
        <div key={layer.id} {...base}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            <path
              d={layer.d}
              pathLength={1}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              style={{ stroke: tokenColor(layer.stroke), strokeWidth: layer.strokeWidth, strokeDasharray: 1, strokeDashoffset: state?.dashOffset ?? 1 }}
            />
          </svg>
        </div>
      );
    case "grain":
      return <div key={layer.id} {...base} className="rv-hs-layer rv-hs-grain" data-blend={layer.blend} style={{ ...base.style, opacity: layer.opacity }} />;
    case "scrim":
      return <div key={layer.id} {...base} />;
  }
}
