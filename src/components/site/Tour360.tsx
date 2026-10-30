/**
 * tour_360: the owner's own 360° panoramas as a drag-around tour. The server
 * and browsers without WebGL show the first panorama as a flat picture with
 * the scene list; Photo Sphere Viewer (MIT) is only downloaded when the
 * visitor presses start, so the page costs nothing until the tour is used.
 */
import { lazy, Suspense, useEffect, useId, useState, type CSSProperties } from "react";
import { tourMode } from "@/lib/builder/premium-effects";
import { useCanvasSlot, useFxEnvironment } from "@/components/site/premium-fx";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };
export type TourScene = { src: string; alt: string; label: string };

const TourCanvas = lazy(() => import("./TourCanvas"));

export function Tour360({ props, label, scenes }: { props: NodeProps; label: string; scenes: TourScene[] }) {
  const env = useFxEnvironment();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const interactive = hydrated && tourMode(env) === "interactive" && !failed;
  const slot = useCanvasSlot(`tour-${useId()}`, "viewer", open && interactive, () => setOpen(false));
  const scene = scenes[active] ?? scenes[0]!;
  return (
    <figure {...props} className={`${props.className ?? ""} rv-tour`.trim()}>
      <div className="rv-tour-stage">
        {open && interactive && slot ? (
          <Suspense fallback={<p className="rv-tour-status" role="status">Loading the 360° tour…</p>}>
            <TourCanvas src={scene.src} alt={scene.alt} reducedMotion={env.reducedMotion} onError={() => setFailed(true)} />
          </Suspense>
        ) : (
          <img src={scene.src} alt={scene.alt} loading="lazy" decoding="async" className="rv-tour-poster" />
        )}
        {interactive && !open ? (
          <button type="button" className="rv-tour-open" onClick={() => setOpen(true)}>Start 360° tour</button>
        ) : null}
        {failed ? <p className="rv-tour-status" role="status">The 360° view couldn't load here.</p> : null}
      </div>
      <figcaption className="rv-tour-caption">
        <span>{label}</span>
        {scenes.length > 1 ? (
          <span className="rv-tour-scenes" role="group" aria-label="Tour scenes">
            {scenes.map((item, i) => (
              <button key={`${i}-${item.label}`} type="button" aria-pressed={i === active} onClick={() => setActive(i)} className="rv-tour-scene">
                {item.label || `Scene ${i + 1}`}
              </button>
            ))}
          </span>
        ) : null}
        {open && interactive ? <span className="rv-tour-hint">Drag to look around · pinch to zoom</span> : null}
      </figcaption>
    </figure>
  );
}
