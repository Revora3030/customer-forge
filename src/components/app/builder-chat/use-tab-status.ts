import { useEffect, useRef, useState } from "react";
import { BADGE_COLOURS, baseTitle, nextTabStatus, tabTitle, type TabStatus } from "@/lib/builder/tab-status";

const ICON_SELECTOR = 'link[rel~="icon"]';

/** Draws a small status dot on the current favicon. Fails quietly (keeps the normal icon). */
function badgeFavicon(status: Exclude<TabStatus, null>, original: string, onReady: (href: string) => void) {
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        ctx.beginPath();
        ctx.arc(24, 24, 7, 0, Math.PI * 2);
        ctx.fillStyle = BADGE_COLOURS[status];
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        onReady(canvas.toDataURL("image/png"));
      } catch {
        /* cross-origin or no canvas: keep the normal icon */
      }
    };
    img.src = original;
  } catch {
    /* keep the normal icon */
  }
}

/**
 * LOV-15: while the builder tab is in the background, its title (and favicon
 * dot) show "Building…", then "Site ready" / "Plan ready to review" / "Needs
 * attention". Everything goes back to normal when the owner returns.
 * Reads only state the chat already has: no polling, no server calls.
 */
export function useTabBuildStatus(working: boolean, lastState: string | null | undefined) {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const status = useRef<TabStatus>(null);
  const wasWorking = useRef(working);
  const originalIcon = useRef<string | null>(null);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const next = nextTabStatus({ hidden, working, wasWorking: wasWorking.current, lastState, current: status.current });
    wasWorking.current = working;
    if (next === status.current) return;
    status.current = next;
    document.title = tabTitle(document.title, next);
    const icon = document.querySelector<HTMLLinkElement>(ICON_SELECTOR);
    if (!icon) return;
    if (originalIcon.current === null) originalIcon.current = icon.href;
    if (next) badgeFavicon(next, originalIcon.current, (href) => {
      if (status.current === next) icon.href = href;
    });
    else icon.href = originalIcon.current;
  }, [hidden, working, lastState]);

  // Leaving the builder never leaves a stale status behind.
  useEffect(
    () => () => {
      document.title = baseTitle(document.title);
      const icon = document.querySelector<HTMLLinkElement>(ICON_SELECTOR);
      if (icon && originalIcon.current) icon.href = originalIcon.current;
    },
    [],
  );
}
