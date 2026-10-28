/**
 * Hands-on blocks for the composition tree: a lens magnifier over one real
 * photograph and a pinned-picture story. Both render a complete static
 * fallback first (the whole picture; the picture above stacked phases) and
 * only gain their controls after hydration, so nothing depends on JavaScript.
 * No library, no network call, no sound.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { lensKeyMove, lensPlacement, LENS_SIZE } from "@/lib/builder/lens";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

const merge = (props: NodeProps, extra: string) => `${props.className ?? ""} ${extra}`.trim();

/**
 * A loupe over one real photograph. Mouse: hover. Touch: a "Magnify" switch
 * turns the loupe on so the page can still be scrolled past the picture.
 * Keyboard: focus the picture and use the arrow keys.
 */
export function LensMagnifier({ props, src, alt, prompt }: { props: NodeProps; src: string; alt: string; prompt: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<{ fx: number; fy: number } | null>(null);
  const [touchOn, setTouchOn] = useState(false);

  const locate = (event: PointerEvent<HTMLDivElement>) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    setPoint({ fx: (event.clientX - box.left) / box.width, fy: (event.clientY - box.top) / box.height });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && !touchOn) return;
    locate(event);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") return setPoint(null);
    const next = lensKeyMove(point?.fx ?? 0.5, point?.fy ?? 0.5, event.key);
    if (!next) return;
    event.preventDefault();
    setPoint(next);
  };

  const box = stage.current?.getBoundingClientRect();
  const placement = point && box?.width ? lensPlacement(point.fx, point.fy, box.width, box.height) : null;

  return (
    <figure {...props} className={merge(props, "rv-lens")}>
      <div
        ref={stage}
        className="rv-lens-stage"
        tabIndex={0}
        role="group"
        aria-label={`${prompt}. Use the arrow keys to move the magnifier over the picture.`}
        style={{ touchAction: touchOn ? "none" : "pan-y" }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={() => setPoint(null)}
        onPointerCancel={() => setPoint(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setPoint(null)}
      >
        <img className="rv-lens-img" src={src} alt={alt} loading="lazy" decoding="async" draggable={false} />
        {placement ? (
          <div
            aria-hidden="true"
            className="rv-lens-loupe"
            style={{
              width: LENS_SIZE,
              height: LENS_SIZE,
              left: placement.left,
              top: placement.top,
              backgroundImage: `url("${src.replace(/"/g, "%22")}")`,
              backgroundSize: `${placement.bgW}px ${placement.bgH}px`,
              backgroundPosition: `${placement.bgX}px ${placement.bgY}px`,
            }}
          />
        ) : null}
      </div>
      <figcaption className="rv-lens-controls">
        <span aria-live="polite">{prompt}</span>
        <button type="button" className="rv-lens-touch" aria-pressed={touchOn} onClick={() => { setTouchOn((on) => !on); setPoint(null); }}>
          {touchOn ? "Stop magnifying" : "Magnify on touch"}
        </button>
      </figcaption>
    </figure>
  );
}

/**
 * The picture stays pinned while the phases scroll past it. Pure CSS
 * (`position: sticky`); on phones the picture sits above the phases and does
 * not pin, so nothing covers the copy.
 */
export function StickySplitStory({ props, picture, phases }: { props: NodeProps; picture: ReactNode; phases: ReactNode[] }) {
  return (
    <section {...props} className={merge(props, "rv-split")}>
      <div className="rv-split-pin">{picture}</div>
      <ol className="rv-split-phases">
        {phases.map((phase, index) => (
          <li key={index} className="rv-split-phase">{phase}</li>
        ))}
      </ol>
    </section>
  );
}
