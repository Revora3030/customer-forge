import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

type Pad = {
  clear(): void;
  isEmpty(): boolean;
  toDataURL(type?: string): string;
  off(): void;
  addEventListener(type: "endStroke", listener: () => void): void;
};

/**
 * Finger, stylus or mouse signature box (signature_pad, MIT, loaded on demand).
 * Reports a PNG data URL after each stroke, or null when cleared.
 */
export function SignaturePad({
  label,
  onChange,
  disabled = false,
}: {
  label: string;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<Pad | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resize: (() => void) | null = null;
    void import("signature_pad").then(({ default: SignaturePadLib }) => {
      const el = canvas.current;
      if (cancelled || !el) return;
      const instance = new SignaturePadLib(el, {
        penColor: "#111111",
        backgroundColor: "rgba(255,255,255,0)",
      }) as unknown as Pad;
      resize = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        el.width = el.offsetWidth * ratio;
        el.height = el.offsetHeight * ratio;
        el.getContext("2d")?.scale(ratio, ratio);
        instance.clear();
        changed.current(null);
      };
      resize();
      window.addEventListener("resize", resize);
      instance.addEventListener("endStroke", () => {
        changed.current(instance.isEmpty() ? null : instance.toDataURL("image/png"));
      });
      pad.current = instance;
      setReady(true);
    });
    return () => {
      cancelled = true;
      if (resize) window.removeEventListener("resize", resize);
      pad.current?.off();
      pad.current = null;
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative rounded-md border border-border bg-white">
        <canvas
          ref={canvas}
          role="img"
          aria-label={label}
          className="block h-36 w-full touch-none rounded-md"
          style={{ pointerEvents: disabled ? "none" : undefined }}
        />
        <span className="pointer-events-none absolute bottom-2 left-3 right-3 border-b border-dashed border-neutral-400 text-[11px] text-neutral-500">
          {ready ? "Sign above this line" : "Loading signature box…"}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !ready}
        onClick={() => {
          pad.current?.clear();
          onChange(null);
        }}
      >
        <Eraser className="size-4" aria-hidden="true" /> Clear
      </Button>
    </div>
  );
}
