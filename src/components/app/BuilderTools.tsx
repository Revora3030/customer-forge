/**
 * Small presentation helpers that keep the builder simple on the surface while
 * every existing panel stays available underneath.
 *
 * `Disclosure` groups advanced panels behind one plain-language toggle
 * (progressive disclosure) and `OverlayPanel` shows secondary tools — history,
 * setup questions — without turning them into permanent destinations.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({
  label,
  hint,
  badge,
  defaultOpen = false,
  children,
}: {
  label: string;
  hint?: string;
  badge?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{label}</span>
          {hint ? (
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{hint}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge ? (
            <span className="rounded-full bg-accent/15 px-1.5 text-[11px] text-accent">
              {badge}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>
      {open ? <div className="space-y-5 border-t border-border p-4">{children}</div> : null}
    </section>
  );
}

export function OverlayPanel({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    // Focus moves into the panel (its close button) and goes back to whatever
    // opened it when it closes, so keyboard and screen-reader users don't get
    // lost behind the scrim.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHandler.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="overlay-scrim absolute inset-0"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface p-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:w-[min(560px,100vw)] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium">{title}</p>
            {description ? (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="relative grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors after:absolute after:-inset-1 hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
