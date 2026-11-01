import { useEffect, useState } from "react";
import {
  consentedVariantOf,
  controlOf,
  trackExposure,
  type ExperimentKey,
  type Variant,
} from "@/lib/experiments";

/**
 * Returns this visitor's sticky variant.
 *
 * The control renders on the server and on the first client paint (so hydration
 * always matches). The test variant applies only once the visitor's analytics
 * choice allows it (see `consentedVariantOf`): in consent regions, after
 * Accept; never under Global Privacy Control or after Reject. Until then the
 * control stays and no exposure is recorded. The choice is re-checked when the
 * visitor changes it in the banner or Cookie settings.
 */
export function useExperiment<K extends ExperimentKey>(key: K): Variant<K> {
  const [variant, setVariant] = useState<Variant<K>>(controlOf(key));

  useEffect(() => {
    let live = true;
    const apply = () => {
      void consentedVariantOf(key).then(({ variant: next, assigned }) => {
        if (!live) return;
        setVariant(next);
        if (assigned) trackExposure(key, next);
      });
    };
    apply();
    window.addEventListener("revora:consent-changed", apply);
    return () => {
      live = false;
      window.removeEventListener("revora:consent-changed", apply);
    };
  }, [key]);

  return variant;
}
