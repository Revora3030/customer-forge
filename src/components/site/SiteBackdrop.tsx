/**
 * Renders the site-wide background. An AI-authored spec (plain gradients the
 * design model wrote itself) wins; the old named backdrops are still read so
 * existing sites keep showing exactly as saved. Pure CSS, SSR-safe, and motion
 * stops for visitors who prefer reduced motion. An authored backdrop gets a
 * static film-grain layer on top so its gradients never read as flat.
 */
import { backdropLayerCss, type BackdropId, type BackdropSpec } from "@/lib/site-effects";
import { VisualComposition } from "@/components/site/VisualComposition";
import { GRAIN_OPACITY, GRAIN_TILE_PX, GRAIN_URL } from "@/components/site/film-grain";
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
        <span
          className="fx-grain"
          style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`, opacity: GRAIN_OPACITY, mixBlendMode: "overlay" }}
        />
      </div>
    );
  }
  if (composition && composition.layers.length) {
    return <VisualComposition composition={composition} />;
  }
  // Old named backdrops are no longer drawn; only AI-authored ones render.
  void backdrop;
  return null;
}
