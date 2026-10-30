/**
 * building_explorer: a 3D stack of the building's floors; clicking a floor (or
 * its button in the list) shows the owner's note for that level. The list is
 * the server render, the keyboard/screen-reader control and the fallback
 * without WebGL; the React Three Fiber scene is downloaded only when the
 * visitor taps "View in 3D", and it takes the page's one-canvas slot.
 */
import { lazy, Suspense, useEffect, useId, useState, type CSSProperties } from "react";
import { buildingMode, type BuildingFloor } from "@/lib/builder/premium-effects";
import { useCanvasSlot, useFxEnvironment } from "@/components/site/premium-fx";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

const BuildingCanvas = lazy(() => import("./BuildingCanvas"));

export function BuildingExplorer({ props, label, floors, accent, photo }: {
  props: NodeProps;
  label: string;
  floors: BuildingFloor[];
  accent: string | undefined;
  photo?: { src: string; alt: string } | null;
}) {
  const env = useFxEnvironment();
  const [hydrated, setHydrated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(floors.length - 1);
  useEffect(() => setHydrated(true), []);
  const can3d = hydrated && !failed && buildingMode(env) === "scene";
  const slot = useCanvasSlot(`building-${useId()}`, "viewer", open && can3d, () => setOpen(false));
  const scene = open && can3d && slot;
  const floor = floors[selected] ?? floors[0];
  // Top floor first, the way a lift panel reads.
  const order = floors.map((_, i) => i).reverse();
  return (
    <figure {...props} className={`${props.className ?? ""} rv-building`.trim()}>
      <div className="rv-building-stage">
        {scene ? (
          <Suspense fallback={photo ? <img src={photo.src} alt={photo.alt} className="rv-building-photo" /> : null}>
            <BuildingCanvas count={floors.length} selected={selected} onSelect={setSelected} accent={accent} reducedMotion={env.reducedMotion} onError={() => setFailed(true)} label={label} />
          </Suspense>
        ) : photo ? (
          <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" className="rv-building-photo" />
        ) : (
          // No photo: a flat CSS floor stack that follows the selected floor.
          <div className="rv-building-still" aria-hidden="true">
            {order.map((i) => <span key={i} data-on={i === selected ? "" : undefined} />)}
          </div>
        )}
        {can3d && !open ? (
          <button type="button" className="rv-building-open" onClick={() => setOpen(true)}>View in 3D</button>
        ) : null}
      </div>
      <div className="rv-building-panel">
        <figcaption className="rv-building-label">{label}</figcaption>
        <ol className="rv-building-floors" aria-label="Floors">
          {order.map((i) => (
            <li key={i}>
              <button type="button" aria-pressed={i === selected} onClick={() => setSelected(i)} className="rv-building-floor">
                {floors[i]!.label}
              </button>
            </li>
          ))}
        </ol>
        {floor?.body ? <p className="rv-building-note" aria-live="polite">{floor.body}</p> : null}
      </div>
    </figure>
  );
}
