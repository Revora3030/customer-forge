import { useLayoutEffect, useRef } from "react";
import {
  DEMO_PREVIEW_LABEL_OFFSET_PX,
  DEMO_PREVIEW_LABEL_TEXT,
} from "@/lib/demo-preview-label";

/**
 * Fixed banner on every /p/:token demo preview. Rendered as a sibling of the
 * generated site (never inside PublicSiteView). Inline styles are applied with
 * the `important` flag so site CSS cannot hide or restyle it. Readable at 390px.
 */
export function DemoPreviewLabel() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (prop: string, value: string) => el.style.setProperty(prop, value, "important");
    set("position", "fixed");
    set("top", "0");
    set("left", "0");
    set("right", "0");
    set("z-index", "2147483646");
    set("box-sizing", "border-box");
    set("display", "flex");
    set("align-items", "center");
    set("justify-content", "center");
    set("min-height", `${DEMO_PREVIEW_LABEL_OFFSET_PX}px`);
    set("padding", "8px 12px");
    set("background", "#111827");
    set("color", "#f9fafb");
    set("font-family", "system-ui, -apple-system, Segoe UI, sans-serif");
    set("font-size", "13px");
    set("font-weight", "600");
    set("line-height", "1.35");
    set("text-align", "center");
    set("letter-spacing", "0.01em");
    set("pointer-events", "none");
    set("visibility", "visible");
    set("opacity", "1");
    set("transform", "none");
    set("clip", "auto");
    set("clip-path", "none");
    set("max-height", "none");
    set("overflow", "visible");
  }, []);

  return (
    <>
      <div ref={ref} role="status" data-revora-demo-label="" aria-live="polite">
        <span style={{ maxWidth: 360 }}>{DEMO_PREVIEW_LABEL_TEXT}</span>
      </div>
      <div
        aria-hidden
        data-revora-demo-label-spacer=""
        style={{ height: DEMO_PREVIEW_LABEL_OFFSET_PX, flexShrink: 0 }}
      />
    </>
  );
}
