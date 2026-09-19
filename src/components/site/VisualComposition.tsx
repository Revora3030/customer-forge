/**
 * Renders a Revora visual composition: a stack of tunable, GPU-friendly CSS
 * layers built from validated primitives.
 *
 * Performance and accessibility are structural:
 *  - no canvas, no WebGL, no per-frame React state — only transforms/opacity,
 *  - pointer and scroll interaction is one throttled rAF writing CSS variables,
 *  - every layer declares its own phone behaviour (keep / simplify / off),
 *  - all motion is removed for visitors who prefer reduced motion (CSS),
 *  - interaction listeners are never attached when no layer asks for them.
 */
import { useEffect, useRef } from "react";
import type { VisualComposition as Composition } from "@/lib/visual-composition";

export function VisualComposition({
  composition,
  /** Preview mode renders inside a card instead of behind the whole page. */
  inline = false,
}: {
  composition: Composition | null;
  inline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wantsPointer = !!composition?.layers.some(
    (l) => l.interaction === "cursor" || l.interaction === "both",
  );
  const wantsScroll = !!composition?.layers.some(
    (l) => l.interaction === "scroll" || l.interaction === "both",
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || (!wantsPointer && !wantsScroll)) return;
    if (typeof window.matchMedia !== "function") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    if (wantsPointer && !window.matchMedia("(pointer: fine)").matches && !wantsScroll) return;

    let frame = 0;
    let x = 0.5;
    let y = 0.35;
    let scroll = 0;

    const paint = () => {
      frame = 0;
      node.style.setProperty("--fxc-mx", x.toFixed(3));
      node.style.setProperty("--fxc-my", y.toFixed(3));
      node.style.setProperty("--fxc-scroll", scroll.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    const onPointer = (event: PointerEvent) => {
      x = event.clientX / Math.max(1, window.innerWidth);
      y = event.clientY / Math.max(1, window.innerHeight);
      schedule();
    };
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scroll = Math.min(1, window.scrollY / max);
      schedule();
    };

    if (wantsPointer) window.addEventListener("pointermove", onPointer, { passive: true });
    if (wantsScroll) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [wantsPointer, wantsScroll]);

  if (!composition || !composition.layers.length) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className={inline ? "fxc fxc-inline" : "fxc"}
      style={{ ["--fxc-intensity" as string]: (composition.intensity / 100).toFixed(2) }}
    >
      {composition.layers.map((layer) => (
        <span
          key={layer.kind}
          className={[
            "fxc-layer",
            `fxc-${layer.kind}`,
            `fxc-motion-${layer.motion}`,
            `fxc-pal-${layer.palette}`,
            `fxc-mob-${layer.mobile}`,
            layer.interaction === "none" ? "" : `fxc-int-${layer.interaction}`,
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              "--fxc-density": (layer.density / 100).toFixed(2),
              "--fxc-op": (layer.opacity / 100).toFixed(2),
              "--fxc-speed": `${Math.max(4, 90 - layer.speed * 0.8).toFixed(1)}s`,
              "--fxc-size": `${(0.6 + layer.scale / 60).toFixed(2)}`,
              "--fxc-par": (layer.parallax / 100).toFixed(2),
            } as Record<string, string>
          }
        />
      ))}
    </div>
  );
}
