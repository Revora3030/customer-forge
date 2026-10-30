/**
 * Numbers that move (quality bar #16 and #20). Server-rendered as the exact
 * final text, so the page is correct without JavaScript, for crawlers and for
 * reduced-motion visitors; after hydration a stat counts up once when it
 * scrolls into view and a live total rolls to each new value. Screen readers
 * only ever hear the final figure.
 */
import { useEffect, useRef, useState } from "react";
import { COUNT_UP_MS, ROLL_MS, countUpFrame, parseCountUp, tweenValue } from "@/lib/builder/count-up";

function reducedMotion(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canAnimate(): boolean {
  return typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" && !reducedMotion();
}

/** A stat figure ("500+", "4.9★", "$1,200") that counts up from zero the first time it is seen. Other text renders as-is. */
export function CountUpText({ text }: { text: string }) {
  const parts = parseCountUp(text);
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!parts || !node || !canAnimate() || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = (now - start) / COUNT_UP_MS;
        setShown(progress >= 1 ? null : countUpFrame(parts, progress, text));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      setShown(countUpFrame(parts, 0, text));
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // The authored text is the only input; parts derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (!parts) return <>{text}</>;
  return (
    <span ref={ref} data-count-up="" className="rv-count-up">
      {shown === null ? text : (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="rv-sr-only sr-only">{text}</span>
        </>
      )}
    </span>
  );
}

/** The value to paint for a live total: rolls from the last value to `target` over ROLL_MS; exact otherwise. */
function useRollingNumber(target: number, durationMs: number = ROLL_MS): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (!canAnimate() || current.current === target) {
      current.current = target;
      setValue(target);
      return;
    }
    from.current = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = (now - start) / durationMs;
      const next = progress >= 1 ? target : tweenValue(from.current, target, progress);
      current.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/**
 * A live figure that rolls to each new value. `format` turns the number into
 * text (e.g. currency); the visual roll is hidden from screen readers, which
 * read the exact final text through the parent's live region.
 */
export function RollingNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useRollingNumber(value);
  const settled = shown === value;
  if (settled) return <>{format(value)}</>;
  return (
    <>
      <span aria-hidden="true" data-rolling="">{format(Math.round(shown))}</span>
      <span className="rv-sr-only sr-only">{format(value)}</span>
    </>
  );
}
