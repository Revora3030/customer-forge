import { Suspense, lazy, useEffect, useState } from "react";

// The visitor assistant (chat, voice and server-function code) is a floating
// widget nobody needs before first paint, so its JavaScript is fetched only
// after the page has loaded and gone idle, or on the visitor's first
// interaction. That keeps it off the main thread during load (Total Blocking
// Time) without changing what the widget does.
const VisitorJarvisImpl = lazy(() =>
  import("@/components/marketing/VisitorJarvis").then((module) => ({ default: module.VisitorJarvis })),
);

const INTERACTION_EVENTS = ["pointerdown", "scroll", "keydown", "touchstart"] as const;
const IDLE_DELAY_MS = 3000;

export function VisitorJarvis() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      window.removeEventListener("load", onLoad);
      for (const name of INTERACTION_EVENTS) window.removeEventListener(name, start);
      window.clearTimeout(timer);
      setReady(true);
    };
    const onLoad = () => {
      timer = window.setTimeout(start, IDLE_DELAY_MS);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    for (const name of INTERACTION_EVENTS) window.addEventListener(name, start, { once: true, passive: true });
    return () => {
      window.removeEventListener("load", onLoad);
      for (const name of INTERACTION_EVENTS) window.removeEventListener(name, start);
      window.clearTimeout(timer);
    };
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <VisitorJarvisImpl />
    </Suspense>
  );
}
