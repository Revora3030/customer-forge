import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Hand, Pencil, Send, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_MARKS,
  MAX_NOTE_CHARS,
  buildAnnotationMessage,
  makeMark,
  thinStroke,
  type Mark,
  type MarkTarget,
  type Pt,
} from "@/lib/builder/draw-annotation";
import { cn } from "@/lib/utils";

/**
 * G-A10 (draw half): ink laid over the live preview. The owner circles or
 * underlines something, types a few words, and the marks go to the builder chat
 * as one message naming the blocks they landed on (the same ids click-to-tag
 * uses, see `draw-annotation.ts`). Works with a finger on the phone view.
 *
 * It sits over one preview frame and works in that frame's own CSS pixels, so
 * a mark means the same thing at 390px and at 1280px however far the frame is
 * scaled down to fit. Each mark remembers how far the page was scrolled, so
 * ink follows the page when the owner switches to Scroll to move around.
 */

type Ink = { points: Pt[]; scrollY: number; mark: Mark };

const INK = "#ef4444";

/** What the owner's mark landed on, read from CU-3's data attributes in the frame. */
function targetAt(frame: HTMLIFrameElement | null, x: number, y: number): MarkTarget | null {
  const doc = frame?.contentDocument;
  if (!doc) return null;
  for (const node of doc.elementsFromPoint(x, y)) {
    if (node.closest("[data-rv-overlay]")) continue;
    const block = node.closest<HTMLElement>("[data-rvb]");
    if (!block) continue;
    const element = node.closest<HTMLElement>("[data-rvp]");
    const own = element && block.contains(element) ? element : null;
    const words = own?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) || null;
    return {
      id: block.getAttribute("data-rvb") ?? "",
      label: block.getAttribute("data-rvb-label"),
      kind: block.getAttribute("data-rvb-kind"),
      ...(own
        ? {
            path: own.getAttribute("data-rvp"),
            element: own.getAttribute("data-rvp-type"),
            text: words,
          }
        : {}),
    };
  }
  return null;
}

function frameScroll(frame: HTMLIFrameElement | null): number {
  try {
    return frame?.contentWindow?.scrollY ?? 0;
  } catch {
    return 0;
  }
}

export function PreviewAnnotateLayer({
  frameRef,
  viewportWidth,
  frameHeight,
  scale,
  pageTitle,
  onSend,
  onClose,
}: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  /** The frame's own CSS width and height (before it is scaled down to fit). */
  viewportWidth: number;
  frameHeight: number;
  scale: number;
  pageTitle: string | null;
  onSend: (message: string) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Pt[] | null>(null);
  const [inks, setInks] = useState<Ink[]>([]);
  const [mode, setMode] = useState<"draw" | "scroll">("draw");
  const [note, setNote] = useState("");
  const [full, setFull] = useState(false);
  const inksRef = useRef(inks);
  inksRef.current = inks;

  const paint = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(viewportWidth * scale));
    const h = Math.max(1, Math.round(frameHeight * scale));
    if (el.width !== Math.round(w * ratio) || el.height !== Math.round(h * ratio)) {
      el.width = Math.round(w * ratio);
      el.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, frameHeight);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 3 / scale;
    const now = frameScroll(frameRef.current);
    const draw = (points: Pt[], offset: number) => {
      if (points.length === 0) return;
      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc((points[0] as Pt).x, (points[0] as Pt).y + offset, 4 / scale, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y + offset) : ctx.lineTo(p.x, p.y + offset),
      );
      ctx.stroke();
    };
    for (const ink of inksRef.current) draw(ink.points, ink.scrollY - now);
    if (live.current) draw(live.current, 0);
  }, [frameRef, viewportWidth, frameHeight, scale]);

  useEffect(() => {
    paint();
  }, [paint, inks]);

  // Ink follows the page while the owner scrolls it in Scroll mode.
  useEffect(() => {
    let win: Window | null = null;
    try {
      win = frameRef.current?.contentWindow ?? null;
    } catch {
      win = null;
    }
    win?.addEventListener("scroll", paint, { passive: true });
    return () => win?.removeEventListener("scroll", paint);
  }, [frameRef, paint]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toFrame = (event: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewportWidth,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * frameHeight,
    };
  };

  const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "draw" || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (inksRef.current.length >= MAX_MARKS) {
      setFull(true);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    live.current = [toFrame(event)];
    paint();
  };
  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!live.current) return;
    live.current.push(toFrame(event));
    paint();
  };
  const onUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const points = live.current;
    live.current = null;
    if (!points) return;
    points.push(toFrame(event));
    const mark = makeMark(points, (x, y) => targetAt(frameRef.current, x, y), {
      width: viewportWidth,
      height: frameHeight,
    });
    if (mark)
      setInks((list) => [
        ...list,
        { points: thinStroke(points), scrollY: frameScroll(frameRef.current), mark },
      ]);
    else paint();
  };
  const onCancel = () => {
    live.current = null;
    paint();
  };

  const canSend = inks.length > 0 || note.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(
      buildAnnotationMessage({
        marks: inks.map((ink) => ink.mark),
        note,
        pageTitle,
        viewportWidth,
      }),
    );
    onClose();
  };

  return (
    <div className="absolute inset-0 z-20" data-testid="preview-annotate">
      <canvas
        ref={canvas}
        data-testid="preview-annotate-canvas"
        aria-label="Drawing layer. Draw on the preview with your finger or mouse to mark what to change."
        className={cn(
          "absolute inset-0 size-full",
          mode === "draw" ? "cursor-crosshair touch-none" : "pointer-events-none",
        )}
        style={{ width: "100%", height: "100%" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      />
      <div
        className="absolute inset-x-1.5 bottom-1.5 flex flex-col gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 shadow-lift backdrop-blur"
        data-testid="preview-annotate-bar"
      >
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant={mode === "draw" ? "secondary" : "ghost"}
            aria-pressed={mode === "draw"}
            aria-label="Draw"
            title="Draw on the page"
            className="min-h-11 min-w-11"
            onClick={() => setMode("draw")}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={mode === "scroll" ? "secondary" : "ghost"}
            aria-pressed={mode === "scroll"}
            aria-label="Scroll the page"
            title="Scroll the page (your marks stay on it)"
            className="min-h-11 min-w-11"
            onClick={() => setMode("scroll")}
          >
            <Hand className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Undo last mark"
            title="Undo last mark"
            className="min-h-11 min-w-11"
            disabled={inks.length === 0}
            onClick={() => {
              setFull(false);
              setInks((list) => list.slice(0, -1));
            }}
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Clear all marks"
            title="Clear all marks"
            className="min-h-11 min-w-11"
            disabled={inks.length === 0}
            onClick={() => {
              setFull(false);
              setInks([]);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
          <span className="ml-auto text-xs text-muted-foreground tnum" aria-live="polite">
            {full ? `Max ${MAX_MARKS} marks` : `${inks.length} mark${inks.length === 1 ? "" : "s"}`}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Stop drawing"
            title="Stop drawing (Esc)"
            className="min-h-11 min-w-11"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <input
            type="text"
            value={note}
            maxLength={MAX_NOTE_CHARS}
            onChange={(event) => setNote(event.target.value)}
            aria-label="What should change about what you marked?"
            placeholder="What should change here?"
            enterKeyHint="send"
            data-testid="preview-annotate-note"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[16px] sm:text-[13px]"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canSend}
            className="min-h-11 shrink-0"
            data-testid="preview-annotate-send"
          >
            <Send className="size-4" aria-hidden /> Send
          </Button>
        </form>
      </div>
    </div>
  );
}
