/**
 * Interactive pieces of the cinematic composition primitives. Each one is
 * server-rendered as a complete, static fallback (a still picture, stacked
 * scenes, a native scrolling row) and only gains its controls after
 * hydration, so the page works without JavaScript and never shows a control
 * that cannot work. No animation library: CSS scroll timelines plus one
 * IntersectionObserver for the chapter rail.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { scrubFrame, scrubProgress, scrubReadout, scrubTime, shouldSeek } from "@/lib/builder/scrub";
import { MIN_SPIN_FRAMES, dialAngle, dialArcPath, dialOptionForKey, dialOptionForPoint, frameForDrag, frameForKey } from "@/lib/builder/cinematic-primitives";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

const merge = (props: NodeProps, extra: string) => `${props.className ?? ""} ${extra}`.trim();

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A muted, inline backdrop video. Paused (first frame only) for reduced-motion visitors; never has sound. */
export function SceneVideo({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Never any sound; playback starts only after hydration and never for
    // reduced-motion visitors (they keep the first frame as a still).
    video.muted = true;
    if (prefersReducedMotion()) video.pause();
    else void video.play?.()?.catch?.(() => undefined);
  }, []);
  return (
    <video ref={ref} className="rv-scene-media" src={src} aria-label={alt || undefined} muted playsInline loop preload={eager ? "auto" : "metadata"} disablePictureInPicture />
  );
}

/**
 * Consecutive full-screen chapters. Without JavaScript (or for reduced
 * motion) they are simply stacked scenes; the rail is plain anchor links and
 * the observer only marks which chapter is in view.
 */
export function ScrollChapters({ props, chapters, labels }: { props: NodeProps; chapters: ReactNode[]; labels: string[] }) {
  const id = props["data-cn"];
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(":scope > .rv-chapter"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = nodes.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      { threshold: 0.55 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [chapters.length]);
  return (
    <div {...props} ref={ref} className={merge(props, "rv-chapters")} data-chapters={chapters.length}>
      <nav className="rv-chapter-rail" aria-label="Chapters">
        {labels.map((label, i) => (
          <a key={i} href={`#${id}-c${i}`} aria-label={`Chapter ${i + 1}: ${label}`} aria-current={active === i ? "true" : undefined}>
            <span aria-hidden="true" />
          </a>
        ))}
      </nav>
      {chapters.map((chapter, i) => (
        <div key={i} id={`${id}-c${i}`} className="rv-chapter" data-chapter={i}>
          {chapter}
        </div>
      ))}
    </div>
  );
}

export type SpinFrame = { src: string; alt: string };

/** Stateless view of the turntable, exported so its markup and ARIA are testable. */
export function SpinViewerView({ props, frames, label, frame, interactive, podium, handlers }: {
  props: NodeProps;
  frames: SpinFrame[];
  label: string;
  frame: number;
  interactive: boolean;
  podium?: string | undefined;
  handlers?: {
    onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
    onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: () => void;
    onFocus?: () => void;
    rotate?: (step: number) => void;
  };
}) {
  const still = frames.length < MIN_SPIN_FRAMES || !interactive;
  const current = frames[Math.min(frames.length - 1, Math.max(0, frame))] ?? frames[0]!;
  const id = props["data-cn"];
  const stageStyle = { ...(podium ? { "--rv-podium": podium } : {}) } as CSSProperties;
  return (
    <figure {...props} className={merge(props, still ? "rv-spin rv-spin-still" : "rv-spin")} data-frames={frames.length}>
      {label ? <figcaption id={`${id}-label`}>{label}</figcaption> : null}
      <div
        className="rv-spin-stage"
        style={stageStyle}
        {...(still
          ? {}
          : {
              role: "slider",
              tabIndex: 0,
              "aria-labelledby": label ? `${id}-label` : undefined,
              "aria-label": label ? undefined : "Rotate the view",
              "aria-valuemin": 1,
              "aria-valuemax": frames.length,
              "aria-valuenow": frame + 1,
              "aria-valuetext": `Angle ${frame + 1} of ${frames.length}`,
              "aria-orientation": "horizontal" as const,
              onKeyDown: handlers?.onKeyDown,
              onPointerDown: handlers?.onPointerDown,
              onPointerMove: handlers?.onPointerMove,
              onPointerUp: handlers?.onPointerUp,
              onPointerCancel: handlers?.onPointerUp,
              onFocus: handlers?.onFocus,
            })}
      >
        <img className="rv-spin-frame" src={current.src} alt={current.alt} loading="lazy" decoding="async" draggable={false} />
        <div className="rv-spin-podium" aria-hidden="true" />
      </div>
      {still ? null : (
        <div className="rv-spin-controls">
          <button type="button" aria-label="Rotate left" onClick={() => handlers?.rotate?.(-1)}>‹</button>
          <button type="button" aria-label="Rotate right" onClick={() => handlers?.rotate?.(1)}>›</button>
        </div>
      )}
    </figure>
  );
}

/**
 * Drag, swipe, arrow keys or the two buttons turn the object through its
 * ordered angle pictures. Server output (and fewer than eight angles) is one
 * still. Angle pictures are only fetched once the visitor starts to turn it.
 */
export function SpinViewer({ props, frames, label, initialFrame = 0, podium }: { props: NodeProps; frames: SpinFrame[]; label: string; initialFrame?: number; podium?: string | undefined }) {
  const [frame, setFrame] = useState(Math.min(frames.length - 1, Math.max(0, initialFrame)));
  const [hydrated, setHydrated] = useState(false);
  const drag = useRef<{ x: number; start: number; width: number } | null>(null);
  const warmed = useRef(false);
  useEffect(() => setHydrated(true), []);
  const warm = () => {
    if (warmed.current || typeof Image === "undefined") return;
    warmed.current = true;
    for (const f of frames) {
      const img = new Image();
      img.decoding = "async";
      img.src = f.src;
    }
  };
  const count = frames.length;
  return (
    <SpinViewerView
      props={props}
      frames={frames}
      label={label}
      frame={frame}
      interactive={hydrated}
      podium={podium}
      handlers={{
        onFocus: warm,
        onKeyDown: (event) => {
          const next = frameForKey(event.key, frame, count);
          if (next === null) return;
          event.preventDefault();
          warm();
          setFrame(next);
        },
        onPointerDown: (event) => {
          warm();
          const box = event.currentTarget.getBoundingClientRect();
          drag.current = { x: event.clientX, start: frame, width: box.width };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        },
        onPointerMove: (event) => {
          const d = drag.current;
          if (d) setFrame(frameForDrag(d.start, event.clientX - d.x, d.width, count));
        },
        onPointerUp: () => {
          drag.current = null;
        },
        rotate: (step) => {
          warm();
          setFrame((current) => (((current + step) % count) + count) % count);
        },
      }}
    />
  );
}

/**
 * A horizontally scrolling, snap-aligned row. The viewport is a focusable
 * region (arrow keys scroll it natively) and every item's action is a normal
 * link in tab order; previous/next buttons appear only after hydration.
 */
export function CollectionRow({ props, label, items }: { props: NodeProps; label: string; items: ReactNode[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const step = (direction: number) => {
    const el = viewport.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>(".rv-collection-item");
    const width = item ? item.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * width, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  return (
    <div {...props} className={merge(props, "rv-collection")}>
      <div ref={viewport} className="rv-collection-viewport" role="region" aria-label={label} tabIndex={0}>
        <ul className="rv-collection-track">
          {items.map((item, i) => (
            <li key={i} className="rv-collection-item">{item}</li>
          ))}
        </ul>
      </div>
      {hydrated && items.length > 1 ? (
        <div className="rv-collection-controls">
          <button type="button" aria-label={`Previous in ${label}`} onClick={() => step(-1)}>‹</button>
          <button type="button" aria-label={`Next in ${label}`} onClick={() => step(1)}>›</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A video whose playhead follows the scroll. It never plays, so it has no
 * sound and no autoplay. Without JavaScript or for reduced motion it is the
 * first frame, exactly like a still scene.
 */
export function ScrubVideo({ src, alt, trackRef }: { src: string; alt: string; trackRef: React.RefObject<HTMLElement | null> }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    const track = trackRef.current;
    if (!el || !track || prefersReducedMotion()) return;
    el.muted = true;
    el.pause();
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = track.getBoundingClientRect();
      const target = scrubTime(scrubProgress(box.top, box.height, window.innerHeight), el.duration);
      if (!shouldSeek(el.currentTime, target)) return;
      if (typeof el.fastSeek === "function") el.fastSeek(target);
      else el.currentTime = target;
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    el.addEventListener("loadedmetadata", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      el.removeEventListener("loadedmetadata", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [trackRef]);
  return <video ref={video} className="rv-scene-media" src={src} aria-label={alt || undefined} muted playsInline preload="auto" disablePictureInPicture />;
}

/**
 * The tall scrolling track that pins one scene while its video scrubs. It is
 * only tall once hydrated and when motion is allowed; before that, and for
 * reduced motion, the scene is a normal one-screen scene showing the first frame.
 */
export function ScrubStage({ src, alt, render }: { src: string; alt: string; render: (video: ReactNode) => ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  useEffect(() => { setLive(!prefersReducedMotion()); }, []);
  return <div ref={track} className="rv-scrub" data-live={live ? "" : undefined}>{render(<ScrubVideo src={src} alt={alt} trackRef={track} />)}</div>;
}

/**
 * A pinned still sequence. Server HTML and reduced motion show the last frame
 * with the copy, so the page is complete with JavaScript off. After hydration,
 * scrolling the track wipes from frame to frame. No canvas and no model file.
 */
/**
 * The progress ring over a live scrub sequence: percent scrolled and the
 * labelled chapter ("2/3 · Roof soft wash"). Decorative for assistive tech —
 * the frame buttons below the copy already name every chapter.
 */
function ScrubHud({ progress, labels }: { progress: number; labels: (string | undefined)[] }) {
  const readout = scrubReadout(progress, labels);
  const r = 15;
  const length = 2 * Math.PI * r;
  return (
    <div className="rv-seq-hud" aria-hidden="true">
      <svg viewBox="0 0 36 36" width="36" height="36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--primary, currentColor)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(readout.percent / 100) * length} ${length}`} transform="rotate(-90 18 18)" />
      </svg>
      <div className="rv-seq-hud-text">
        <strong>{readout.percent}<small>%</small></strong>
        <span>{readout.step}/{readout.total}{readout.label ? ` · ${readout.label}` : ""}</span>
      </div>
    </div>
  );
}

export function ScrubSequence({
  props, frames, copy, prompt, scrim, ink,
}: {
  props: NodeProps;
  frames: { src: string; alt: string; label?: string }[];
  copy: ReactNode;
  prompt: string;
  scrim: string;
  ink: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion() || frames.length < 2) return;
    setLive(true);
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = track.current?.getBoundingClientRect();
      if (!box) return;
      setProgress(scrubProgress(box.top, box.height, window.innerHeight));
    };
    const onScroll = () => { setPinned(null); if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [frames.length]);
  const shown = pinned != null ? { index: pinned, mix: 0 } : live ? scrubFrame(progress, frames.length) : { index: Math.max(0, frames.length - 1), mix: 0 };
  const last = Math.max(0, frames.length - 1);
  const labelled = frames.some((frame) => frame.label);
  return (
    <div ref={track} {...props} className={merge(props, "rv-seq")} data-live={live ? "" : undefined}>
      <div className="rv-seq-pin">
        <div className="rv-seq-stage" style={{ color: ink }}>
          {frames.map((frame, index) => {
            const incoming = live && index === shown.index + 1;
            const current = live ? index === shown.index : index === last;
            const visible = current || incoming;
            const clip = incoming ? `inset(0 ${(1 - shown.mix) * 100}% 0 0)` : undefined;
            return (
              <img
                key={frame.src}
                className="rv-seq-frame"
                src={frame.src}
                alt={index === last ? frame.alt : ""}
                aria-hidden={index === last ? undefined : true}
                loading={index === 0 || index === last ? "eager" : "lazy"}
                decoding="async"
                style={{ opacity: visible ? 1 : 0, clipPath: clip, zIndex: incoming ? 2 : 1 }}
              />
            );
          })}
          <div className="rv-seq-scrim" aria-hidden="true" style={{ background: `linear-gradient(to top, ${scrim} 0%, ${scrim} 42%, transparent 100%)` }} />
          {live && labelled ? <ScrubHud progress={pinned != null ? (pinned + 0.5) / frames.length : progress} labels={frames.map((frame) => frame.label)} /> : null}
          <div className="rv-seq-copy">
            {copy}
            {prompt ? <p className="rv-seq-prompt">{prompt}</p> : null}
            {frames.length > 1 ? (
              <div role="group" aria-label="Sequence frames" className="mt-2 flex flex-wrap gap-2">
                {frames.map((frame, index) => (
                  <button
                    key={frame.src}
                    type="button"
                    aria-pressed={shown.index === index}
                    onClick={() => { setLive(true); setPinned(index); }}
                    className="min-h-11 min-w-11 rounded-full border border-current px-3 text-[13px] font-semibold"
                  >
                    {frame.label || index + 1}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "The right setting for every surface": option chips and a gauge whose
 * needle sweeps to the chosen option's level. The server render shows the
 * first option selected and lists every option in a plain table, so the facts
 * read without JavaScript; the chips work as a single-select radio group.
 */
export function DialSelector({ props, label, options, unit }: {
  props: NodeProps;
  label: string;
  options: { label: string; value: string; note?: string; level: number }[];
  unit?: string | undefined;
}) {
  const [selected, setSelected] = useState(0);
  const [live, setLive] = useState(false);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setLive(true), []);
  const option = options[Math.min(selected, options.length - 1)]!;
  const cx = 60;
  const cy = 60;
  const r = 46;
  const track = dialArcPath(cx, cy, r, 100);
  const fill = dialArcPath(cx, cy, r, option.level);
  const choose = (index: number) => {
    setSelected(index);
    chips.current[index]?.focus();
  };
  // Drag (or tap) the gauge itself to turn the dial; the chips and arrow
  // keys stay the accessible way to choose.
  const dragging = useRef(false);
  const pickFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dx = ((event.clientX - box.left) / box.width) * 120 - cx;
    const dy = ((event.clientY - box.top) / box.height) * 104 - cy;
    const next = dialOptionForPoint(dx, dy, options.map((item) => item.level));
    if (next != null && next !== selected) setSelected(next);
  };
  const gaugeDrag = live
    ? {
        onPointerDown: (event: PointerEvent<SVGSVGElement>) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          pickFromPointer(event);
        },
        onPointerMove: (event: PointerEvent<SVGSVGElement>) => {
          if (dragging.current) pickFromPointer(event);
        },
        onPointerUp: () => { dragging.current = false; },
        onPointerCancel: () => { dragging.current = false; },
        "data-draggable": "",
      }
    : {};
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = dialOptionForKey(event.key, selected, options.length);
    if (next == null) return;
    event.preventDefault();
    choose(next);
  };
  return (
    <div {...props} className={merge(props, "rv-dial")}>
      <div className="rv-dial-gauge">
        <svg viewBox="0 0 120 104" role="img" aria-label={`${option.label}: ${option.value}${unit ? ` ${unit}` : ""}`} {...gaugeDrag}>
          <path d={track} fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="9" strokeLinecap="round" />
          {fill ? <path className="rv-dial-fill" d={fill} fill="none" stroke="var(--primary, currentColor)" strokeWidth="9" strokeLinecap="round" /> : null}
          <line className="rv-dial-needle" x1={cx} y1={cy} x2={cx} y2={cy - (r - 12)} stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ transform: `rotate(${dialAngle(option.level)}deg)`, transformOrigin: `${cx}px ${cy}px` }} />
          <circle cx={cx} cy={cy} r="5" fill="currentColor" />
        </svg>
        <div className="rv-dial-reading" aria-live="polite">
          <strong>{option.value}</strong>
          {unit ? <span>{unit}</span> : null}
        </div>
        <p className="rv-dial-option">{option.label}</p>
        {option.note ? <p className="rv-dial-note">{option.note}</p> : null}
      </div>
      {live ? (
        <div role="radiogroup" aria-label={label} className="rv-dial-chips">
          {options.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => { chips.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={selected === index}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={onKey}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <table className="rv-dial-list">
          <caption>{label}</caption>
          <tbody>
            {options.map((item) => (
              <tr key={item.label}><th scope="row">{item.label}</th><td>{item.value}{unit ? ` ${unit}` : ""}{item.note ? ` — ${item.note}` : ""}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
