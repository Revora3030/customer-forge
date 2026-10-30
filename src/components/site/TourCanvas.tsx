/** The WebGL half of tour_360, loaded on demand (Photo Sphere Viewer, MIT). */
import { useEffect, useRef } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

export default function TourCanvas({ src, alt, reducedMotion, onError }: { src: string; alt: string; reducedMotion: boolean; onError: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const shown = useRef(src);
  const failed = useRef(onError);
  failed.current = onError;

  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const lost = () => failed.current();
    host.addEventListener("webglcontextlost", lost, true);
    try {
      // The page keeps scrolling with the wheel; zoom is pinch or the zoom buttons.
      viewer.current = new Viewer({
        container: host,
        panorama: src,
        caption: alt,
        navbar: ["zoom", "move", "caption", "fullscreen"],
        mousewheel: false,
        touchmoveTwoFingers: true,
        moveInertia: !reducedMotion,
        loadingTxt: "Loading…",
      });
      viewer.current.addEventListener("panorama-error", () => failed.current());
    } catch {
      failed.current();
    }
    return () => {
      host.removeEventListener("webglcontextlost", lost, true);
      viewer.current?.destroy();
      viewer.current = null;
    };
    // The viewer is created once; scene changes go through setPanorama below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = viewer.current;
    if (!current || shown.current === src) return;
    shown.current = src;
    current.setPanorama(src, { caption: alt, transition: reducedMotion ? false : { speed: 900 } }).catch(() => failed.current());
  }, [src, alt, reducedMotion]);

  return <div ref={box} className="rv-tour-canvas" role="img" aria-label={alt} />;
}
