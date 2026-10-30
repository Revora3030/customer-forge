/**
 * The WebGL half of shader_field, loaded on demand. Paper Shaders
 * (@paper-design/shaders-react 0.0.82, Apache-2.0; NOTICE kept in
 * THIRD_PARTY_NOTICES.md). Pixel ratio and pixel count are capped for phones,
 * the context asks for low power, and a lost context falls back to the poster.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { GodRays, GrainGradient, MeshGradient, NeuroNoise, Swirl, Warp } from "@paper-design/shaders-react";
import { shaderPixelBudget, shaderSpeed, type FxTier, type ShaderKind } from "@/lib/builder/premium-effects";

const LAYER: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" };
const GL: WebGLContextAttributes = { powerPreference: "low-power", antialias: false, preserveDrawingBuffer: false };

export default function ShaderCanvas({ kind, colors, tier, onLost }: { kind: ShaderKind; colors: readonly string[]; tier: FxTier; onLost: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const lost = useRef(onLost);
  lost.current = onLost;
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const handler = () => lost.current();
    host.addEventListener("webglcontextlost", handler, true);
    return () => host.removeEventListener("webglcontextlost", handler, true);
  }, []);
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  // Paper pauses itself offscreen and on a hidden tab; the speed here is the tier's pace.
  const common = { style: LAYER, speed: shaderSpeed(tier, true), minPixelRatio: 1, maxPixelCount: shaderPixelBudget(width), webGlContextAttributes: GL };
  const [back, deep, accent, soft] = colors as [string, string, string, string];
  let shader;
  switch (kind) {
    case "grain":
      shader = <GrainGradient {...common} colorBack={back} colors={[deep, accent, soft]} softness={0.7} intensity={0.35} noise={0.25} shape="blob" />;
      break;
    case "warp":
      shader = <Warp {...common} colors={[back, deep, accent, soft]} proportion={0.4} softness={0.9} distortion={0.2} swirl={0.6} />;
      break;
    case "swirl":
      shader = <Swirl {...common} colorBack={back} colors={[deep, accent, soft]} bandCount={3} twist={0.3} softness={0.8} noise={0.1} />;
      break;
    case "god-rays":
      shader = <GodRays {...common} colorBack={back} colorBloom={soft} colors={[accent, soft]} density={0.3} intensity={0.6} bloom={0.4} spotty={0.3} midSize={0.2} midIntensity={0.4} />;
      break;
    case "neuro-noise":
      shader = <NeuroNoise {...common} colorBack={back} colorMid={deep} colorFront={accent} brightness={0.05} contrast={0.3} />;
      break;
    default:
      shader = <MeshGradient {...common} colors={[back, deep, accent, soft]} distortion={0.8} swirl={0.35} grainMixer={0} grainOverlay={0.08} />;
  }
  return <div ref={box} aria-hidden="true" style={LAYER}>{shader}</div>;
}
