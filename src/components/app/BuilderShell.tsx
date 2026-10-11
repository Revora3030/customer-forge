import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Menu, Redo2, Undo2 } from "lucide-react";
import { useBuilderHistory } from "@/lib/builder-history.hooks";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import "./builder-workspace.css";
import { BuilderAccessNotice } from "@/components/app/BuilderAccessNotice";
import type { BuilderAccessUiState } from "@/lib/builder-access-status";

function UndoRedo() {
  const history = useBuilderHistory();
  const base = "grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:text-muted-foreground";
  return (
    <div className="flex items-center gap-1" aria-label="Draft edit history" role="group">
      <button type="button" onClick={history.undo} disabled={!history.canUndo} className={base}
        title={history.undoLabel ? `Undo ${history.undoLabel}` : "Nothing to undo yet"}
        aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}>
        <Undo2 className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={history.redo} disabled={!history.canRedo} className={base}
        title={history.redoLabel ? `Redo ${history.redoLabel}` : "Nothing to redo"}
        aria-label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}>
        <Redo2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export type BuilderSection = {
  key: string;
  label: string;
  hint?: string;
  badge?: number;
  node: ReactNode;
};

export type BuilderShellProps = {
  projectName: string;
  statusLabel: string;
  statusTone?: "draft" | "live" | "warn";
  saveLabel?: string;
  actions?: ReactNode;
  sections: BuilderSection[];
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
};

const toneClass: Record<NonNullable<BuilderShellProps["statusTone"]>, string> = {
  draft: "border-border text-muted-foreground",
  live: "border-primary/40 text-primary",
  warn: "border-accent/50 text-accent",
};

export function BuilderShell({ projectName, statusLabel, statusTone = "draft", saveLabel, actions,
  sections, activeKey, onActiveKeyChange }: BuilderShellProps) {
  const [internal, setInternal] = useState(sections[0]?.key ?? "");
  const [navOpen, setNavOpen] = useState(false);
  const [accessState, setAccessState] = useState<BuilderAccessUiState>("checking");
  const rootRef = useRef<HTMLDivElement>(null);
  const active = activeKey ?? internal;
  const current = useMemo(() => sections.find((section) => section.key === active) ?? sections[0], [sections, active]);

  const setActive = (key: string) => {
    if (!sections.some((section) => section.key === key)) return;
    setInternal(key);
    onActiveKeyChange?.(key);
    setNavOpen(false);
    if (typeof window !== "undefined") {
      const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    const update = () => root.style.setProperty("--builder-visual-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--builder-visual-height");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setNavOpen(false); };
    closeOnDesktop();
    desktop.addEventListener?.("change", closeOnDesktop);
    return () => desktop.removeEventListener?.("change", closeOnDesktop);
  }, []);

  useEffect(() => { if (sections.length <= 1) setNavOpen(false); }, [sections.length]);

  return (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <div ref={rootRef} data-revora-builder-workspace="true" data-builder-access-state={accessState} className="-mt-1 min-w-0">
        <div data-testid="builder-topbar" className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mb-3 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {sections.length > 1 ? (
              <SheetTrigger asChild>
                <button type="button" aria-label="Open builder sections" className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
                  <Menu className="size-4" aria-hidden />
                </button>
              </SheetTrigger>
            ) : null}
            <div className="min-w-0 flex-1 text-left">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="max-w-full truncate text-[15px] font-semibold tracking-tight" title={projectName}>{projectName}</p>
                <span data-testid="builder-status" className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClass[statusTone])}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", statusTone === "live" ? "bg-emerald-400" : statusTone === "warn" ? "bg-accent" : "bg-muted-foreground/60")} />
                  {statusLabel}
                </span>
              </div>
              {saveLabel ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground" role="status">{saveLabel}</p> : null}
            </div>
            <div data-testid="builder-project-actions" className="flex w-full min-w-0 items-center justify-end gap-1.5 overflow-x-auto py-1 sm:w-auto [&>a]:shrink-0 [&>button]:shrink-0 [&>a]:whitespace-nowrap [&>button]:whitespace-nowrap">
              <UndoRedo />
              {actions}
            </div>
          </div>
        </div>

        <BuilderAccessNotice onStateChange={setAccessState} />
        <div className="flex min-w-0 gap-6">
          <nav aria-label="Builder sections" className={cn("hidden w-56 shrink-0", sections.length > 1 && "lg:block")}>
            <div className="sticky top-24 space-y-1">
              {sections.map((section) => <NavItem key={section.key} section={section} active={section.key === current?.key} onSelect={() => setActive(section.key)} showHint />)}
            </div>
          </nav>
          <div className={cn("min-w-0 flex-1 lg:pb-6", sections.length > 1 ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : "pb-6")}>
            {sections.length > 1 ? <div className="mb-3 lg:hidden"><p className="eyebrow">{current?.label}</p></div> : null}
            {current?.node}
          </div>
        </div>

        {sections.length > 1 ? (
          <>
            <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <SheetHeader>
                <SheetTitle>Builder sections</SheetTitle>
                <SheetDescription>Choose a workspace panel. Switching panels does not publish your draft.</SheetDescription>
              </SheetHeader>
              <div className="space-y-1">
                {sections.map((section) => <NavItem key={section.key} section={section} active={section.key === current?.key} onSelect={() => setActive(section.key)} showHint />)}
              </div>
            </SheetContent>
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
              <nav aria-label="Builder modes" className="flex gap-1 overflow-x-auto px-2 py-1.5">
                {sections.map((section) => (
                  <button key={section.key} type="button" aria-current={section.key === current?.key ? "page" : undefined}
                    onClick={() => setActive(section.key)}
                    className={cn("min-h-11 min-w-20 flex-1 shrink-0 cursor-pointer rounded-lg px-3 py-2 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", section.key === current?.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-elevated hover:text-foreground")}>
                    <span className="block whitespace-nowrap">{section.label}</span>
                    {section.badge ? <span className="mt-0.5 block text-[10px] text-accent">{section.badge}</span> : null}
                  </button>
                ))}
              </nav>
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function NavItem({ section, active, onSelect, showHint }: { section: BuilderSection; active: boolean; onSelect: () => void; showHint?: boolean }) {
  return (
    <button type="button" onClick={onSelect} aria-current={active ? "page" : undefined}
      className={cn("min-h-11 w-full cursor-pointer rounded-lg border px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", active ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-elevated")}>
      <span className="flex items-center justify-between gap-2">
        <span className={cn("text-[13px] font-medium", active ? "text-primary" : "text-foreground")}>{section.label}</span>
        {section.badge ? <span className="rounded-full bg-accent/15 px-1.5 text-[10px] text-accent">{section.badge}</span> : null}
      </span>
      {showHint && section.hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{section.hint}</span> : null}
    </button>
  );
}
