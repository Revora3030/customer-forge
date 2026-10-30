/**
 * Browser side of the premium effects: the site-wide owner switch (a context
 * the public page provides), what this visitor's browser allows, and a hook
 * that says when a block is near the screen. Every heavy library is imported
 * lazily by the block that needs it, never from here.
 */
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";
import { createCanvasBudget, STILL_ENVIRONMENT, type CanvasBudget, type FxEnvironment, type FxTier } from "@/lib/builder/premium-effects";

/**
 * Site-wide premium switch, the trade tier and the page's one-canvas budget.
 * Defaults to on at T2 so the builder preview shows the real look.
 */
export type PremiumFx = { enabled: boolean; tier: FxTier; budget: CanvasBudget };
const pageBudget = createCanvasBudget();
// eslint-disable-next-line react-refresh/only-export-components -- context value factory
export function premiumFxValue(enabled: boolean, tier: FxTier): PremiumFx {
  return { enabled, tier, budget: pageBudget };
}
export const PremiumFxContext = createContext<PremiumFx>(premiumFxValue(true, 2));
export const usePremiumFx = () => useContext(PremiumFxContext);

// eslint-disable-next-line react-refresh/only-export-components -- shared browser probe
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function readEnvironment(): FxEnvironment {
  if (typeof window === "undefined") return STILL_ENVIRONMENT;
  const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return { webgl: webglAvailable(), reducedMotion, saveData: Boolean(connection?.saveData) };
}

/** Still on the server and first paint (so markup matches), then what the browser really allows. */
export function useFxEnvironment(): FxEnvironment {
  const [env, setEnv] = useState<FxEnvironment>(STILL_ENVIRONMENT);
  useEffect(() => {
    setEnv(readEnvironment());
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setEnv(readEnvironment());
    query?.addEventListener?.("change", update);
    return () => query?.removeEventListener?.("change", update);
  }, []);
  return env;
}

/**
 * Holds the page's one live canvas while `want` is true. A background loses
 * the slot (and falls back to its poster) when a viewer is opened.
 */
export function useCanvasSlot(id: string, kind: "background" | "viewer", want: boolean, onDisplaced?: () => void): boolean {
  const { budget } = usePremiumFx();
  const [held, setHeld] = useState(false);
  const displaced = useRef(onDisplaced);
  displaced.current = onDisplaced;
  useEffect(() => {
    if (!want) { budget.release(id); setHeld(false); return; }
    let mine = budget.acquire({ id, kind });
    setHeld(mine);
    const unsubscribe = budget.subscribe((holder) => {
      // Viewers stay closed once displaced; backgrounds come back when the slot frees.
      if (holder === null && kind === "background") mine = budget.acquire({ id, kind });
      else {
        const now = holder?.id === id;
        if (mine && !now) displaced.current?.();
        mine = now;
      }
      setHeld(mine);
    });
    return () => { unsubscribe(); budget.release(id); };
  }, [budget, id, kind, want]);
  return held;
}

/** True while the element is within a screen of the viewport (once seen with `once`). */
export function useNearScreen(ref: RefObject<Element | null>, once = false): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      const hit = Boolean(entry?.isIntersecting);
      setNear(hit);
      if (hit && once) observer.disconnect();
    }, { rootMargin: "200px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, once]);
  return near;
}
