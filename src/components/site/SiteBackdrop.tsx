/**
 * Renders the site-wide background. An AI-authored spec (plain gradients the
 * design model wrote itself) wins; the old named backdrops are still read so
 * existing sites keep showing exactly as saved. Pure CSS, SSR-safe, and motion
 * stops for visitors who prefer reduced motion.
 */
import { backdropLayerCss, type BackdropId, type BackdropSpec } from "@/lib/site-effects";
import { VisualComposition } from "@/components/site/VisualComposition";
import type { VisualComposition as Composition } from "@/lib/visual-composition";

export function SiteBackdrop({
  backdrop,
  composition = null,
  spec = null,
}: {
  backdrop: BackdropId;
  composition?: Composition | null;
  spec?: BackdropSpec | null;
}) {
  if (spec && spec.layers.length) {
    return (
      <div aria-hidden className="fx-backdrop">
        {spec.layers.map((layer, index) => (
          <span
            key={index}
            className={`fx-authored-layer${spec.drift === "none" ? "" : ` fx-authored-drift-${spec.drift}`}`}
            style={{ backgroundImage: backdropLayerCss(layer), opacity: layer.opacity / 100 }}
          />
        ))}
      </div>
    );
  }
  if (composition && composition.layers.length) {
    return <VisualComposition composition={composition} />;
  }
  if (backdrop === "none") return null;
  return (
    <div aria-hidden className={`fx-backdrop fx-backdrop-${backdrop.replace(/_/g, "-")}`}>
      <span className="fx-layer fx-layer-1" />
      <span className="fx-layer fx-layer-2" />
      <span className="fx-layer fx-layer-3" />
    </div>
  );
}
