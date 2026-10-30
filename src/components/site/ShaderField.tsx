/**
 * shader_field: copy over an animated Paper Shaders colour field. The server
 * and every fallback (no WebGL, reduced motion, data saver, owner switched
 * effects off) paint the same palette as a still CSS gradient; the shader
 * library is only downloaded once the block is near the screen, and the
 * canvas only lives while it holds the page's one-canvas slot.
 */
import { lazy, Suspense, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { shaderMode, shaderPalette, shaderStillCss, type ShaderKind } from "@/lib/builder/premium-effects";
import { useCanvasSlot, useFxEnvironment, useNearScreen, usePremiumFx } from "@/components/site/premium-fx";

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

const ShaderCanvas = lazy(() => import("./ShaderCanvas"));

export function ShaderField({ props, kind, base, accent, children }: {
  props: NodeProps;
  kind: ShaderKind;
  base: string | undefined;
  accent: string | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const env = useFxEnvironment();
  const { enabled, tier } = usePremiumFx();
  const near = useNearScreen(ref);
  const [lost, setLost] = useState(false);
  const palette = shaderPalette(base, accent);
  const allowed = shaderMode(env, enabled, tier) === "live" && !lost;
  const slot = useCanvasSlot(`shader-${useId()}`, "background", allowed && near);
  const live = allowed && near && slot;
  const { background: _bg, backgroundImage: _img, ...rest } = props.style;
  return (
    <div {...props} ref={ref} data-shader={kind} data-shader-mode={live ? "live" : "still"}
      className={`${props.className ?? ""} rv-shader`.trim()}
      style={{ ...rest, position: rest.position ?? "relative", isolation: "isolate", overflow: "hidden", background: shaderStillCss(palette, kind) }}>
      {live ? (
        <Suspense fallback={null}>
          <ShaderCanvas kind={kind} colors={palette} tier={tier} onLost={() => setLost(true)} />
        </Suspense>
      ) : null}
      {children}
    </div>
  );
}
