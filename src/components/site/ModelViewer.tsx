/**
 * model_3d_viewer: the owner's own .glb, orbit + zoom. Server-renders as its
 * poster picture (or a labelled stage) with a "View in 3D" button; the three.js
 * canvas is only downloaded when the visitor asks for it, so a page with a
 * model costs nothing until it's used and still reads without JavaScript.
 */
import { lazy, Suspense, useEffect, useId, useState, type CSSProperties } from "react";
import { useCanvasSlot } from "@/components/site/premium-fx";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

const ModelCanvas = lazy(() => import("./ModelCanvas"));

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function ModelViewer({ props, src, alt, label, poster }: {
  props: NodeProps;
  src: string;
  alt: string;
  label: string;
  poster?: { src: string; alt: string } | null;
}) {
  const [live, setLive] = useState(false);
  const [can3d, setCan3d] = useState(false);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setLive(true);
    setCan3d(webglAvailable());
  }, []);
  // The page's one live canvas: opening this model pauses a shader background
  // or closes another viewer.
  const slot = useCanvasSlot(`model-${useId()}`, "viewer", open && can3d && !failed, () => setOpen(false));
  const showCanvas = open && can3d && !failed && slot;
  return (
    <figure {...props} className={`${props.className ?? ""} rv-model`.trim()}>
      <div className="rv-model-stage">
        {showCanvas ? (
          <Suspense fallback={<p className="rv-model-status" role="status">Loading the 3D model…</p>}>
            <ModelCanvas src={src} alt={alt} onError={() => setFailed(true)} />
          </Suspense>
        ) : poster ? (
          <img src={poster.src} alt={poster.alt || alt} loading="lazy" decoding="async" className="rv-model-poster" />
        ) : (
          <div className="rv-model-placeholder" role="img" aria-label={alt}><span aria-hidden="true">3D</span></div>
        )}
        {live && can3d && !open && !failed ? (
          <button type="button" className="rv-model-open" onClick={() => setOpen(true)}>View in 3D</button>
        ) : null}
        {failed ? <p className="rv-model-status" role="status">The 3D model couldn't load here.</p> : null}
      </div>
      <figcaption className="rv-model-caption">
        <span>{label}</span>
        {showCanvas ? <span className="rv-model-hint">Drag to turn · pinch or scroll to zoom</span> : null}
      </figcaption>
    </figure>
  );
}
