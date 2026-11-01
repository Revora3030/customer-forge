/**
 * Dismissible "need a hand?" drawer for a published customer site. See
 * `lib/site-help-drawer.ts` for the rules: off by default, local timer only,
 * nothing stored or sent, verified phone only.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { HELP_DRAWER_IDLE_MS, helpDrawerActions, shouldOpenHelpDrawer } from "@/lib/site-help-drawer";

type Action = { label: string; href: string; kind: "call" | "book" | "quote" | "contact" };

export function SiteHelpDrawer({ actions, idleMs = HELP_DRAWER_IDLE_MS }: { actions: readonly Action[]; idleMs?: number }) {
  const offered = helpDrawerActions(actions);
  const hasActions = offered.length > 0;
  const [open, setOpen] = useState(false);
  const state = useRef({ started: false, last: 0, dismissed: false });

  useEffect(() => {
    if (!hasActions) return;
    const touch = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-rv-quote]")) return;
      state.current.started = true;
      state.current.last = Date.now();
    };
    const events = ["click", "input", "change", "keydown"] as const;
    events.forEach((name) => document.addEventListener(name, touch, true));
    const timer = window.setInterval(() => {
      if (
        shouldOpenHelpDrawer({
          started: state.current.started,
          lastActivityAt: state.current.last,
          now: Date.now(),
          quoteDone: Boolean(document.querySelector('[data-rv-quote="done"]')),
          dismissed: state.current.dismissed,
          tabHidden: document.hidden,
          hasActions,
          idleMs,
        })
      ) {
        setOpen(true);
      }
    }, 1000);
    return () => {
      events.forEach((name) => document.removeEventListener(name, touch, true));
      window.clearInterval(timer);
    };
  }, [hasActions, idleMs]);

  const close = () => {
    state.current.dismissed = true;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !hasActions) return null;
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Need a hand with your quote?"
      data-testid="site-help-drawer"
      className="fixed bottom-24 right-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-4 text-foreground shadow-lg md:bottom-6 md:right-6"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <p className="pr-8 text-[15px] font-semibold">Need a hand with your quote?</p>
      <p className="mt-1 text-[14px] text-muted-foreground">Pick up where you left off, or talk to us directly.</p>
      <div className="mt-3 flex flex-col gap-2">
        {offered.map((action) => (
          <a
            key={action.kind}
            href={action.href}
            onClick={action.kind === "quote" ? close : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[15px] font-semibold no-underline ${
              action.kind === "call" ? "bg-primary text-primary-foreground" : "border border-border text-foreground"
            }`}
          >
            {action.label}
          </a>
        ))}
      </div>
    </aside>
  );
}
