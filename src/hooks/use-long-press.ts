import { useRef } from "react";
import { LONG_PRESS_MS, LONG_PRESS_SLOP } from "@/lib/city-tap-actions";

/**
 * Long-press (touch / pen / mouse hold) and right-click / context-menu key.
 * Returns props to spread on a button plus `consumed()` so the following click can be ignored.
 */
export function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } start.current = null; };
  return {
    consumed: () => { const f = fired.current; fired.current = false; return f; },
    props: {
      onPointerDown: (e: React.PointerEvent) => { fired.current = false; start.current = { x: e.clientX, y: e.clientY }; timer.current = window.setTimeout(() => { fired.current = true; timer.current = null; onLongPress(); }, ms); }, // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
      onPointerMove: (e: React.PointerEvent) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > LONG_PRESS_SLOP) clear(); },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = false; onLongPress(); },
    },
  };
}
