/**
 * Builder workspace shell.
 *
 * Turns the builder from one very long page into an application workspace:
 * a compact top bar (project + save/publish state + actions), a persistent
 * left workspace nav on desktop, one focused panel area, and a real mobile
 * layout (compact toolbar + bottom nav + sheet) instead of a stacked desktop.
 *
 * It only arranges existing, already-working panels — no feature is replaced.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Menu, Redo2, Undo2, X } from "lucide-react";
import { useBuilderHistory } from "@/lib/builder-history.hooks";
import { cn } from "@/lib/utils";

/**
 * Undo/redo for every builder edit in this session. Disabled buttons stay
 * visible so the safety net is discoverable before the first edit.
 */
function UndoRedo() {
  const history = useBuilderHistory();
  const base =
    "grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={history.undo}
        disabled={!history.canUndo}
        className={base}
        title={history.undoLabel ? `Undo ${history.undoLabel}` : "Nothing to undo yet"}
        aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
      >
        <Undo2 className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={history.redo}
        disabled={!history.canRedo}
        className={base}
        title={history.redoLabel ? `Redo ${history.redoLabel}` : "Nothing to redo"}
        aria-label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
      >
        <Redo2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export type BuilderSection = {
  key: string;
  label: string;
  /** Short hint shown in the nav on desktop. Keep it to a few words. */
  hint?: string;
  /** Optional count/dot badge, e.g. required answers left. */
  badge?: number;
  node: ReactNode;
};

export type BuilderShellProps = {
  projectName: string;
  /** e.g. "Draft", "Published", "Preview only" */
  statusLabel: string;
  statusTone?: "draft" | "live" | "warn";
  /** e.g. "Saved", "Saving…", "Unsaved changes" */
  saveLabel?: string;
  actions?: ReactNode;
  sections: BuilderSection[];
  /** Controlled active section key (so other panels can deep-link). */
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
};

const toneClass: Record<NonNullable<BuilderShellProps["statusTone"]>, string> = {
  draft: "border-border text-muted-foreground",
  live: "border-primary/40 text-primary",
  warn: "border-accent/50 text-accent",
};

export function BuilderShell({
  projectName,
  statusLabel,
  statusTone = "draft",
  saveLabel,
  actions,
  sections,
  activeKey,
  onActiveKeyChange,
}: BuilderShellProps) {
  const first = sections[0]?.key ?? "";
  const [internal, setInternal] = useState(first);
  const active = activeKey ?? internal;
  const [navOpen, setNavOpen] = useState(false);

  const setActive = (key: string) => {
    setInternal(key);
    onActiveKeyChange?.(key);
    setNavOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keep the mobile sheet from leaving the page scroll-locked.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  const current = useMemo(
    () => sections.find((section) => section.key === active) ?? sections[0],
    [sections, active],
  );

  return (
    <div className="-mt-1">
      {/* ---------------------------- Top bar ---------------------------- */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {sections.length > 1 ? (
          <button
            type="button"
            aria-label="Open builder sections"
            onClick={() => setNavOpen(true)}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:hidden"
          >
            <Menu className="size-4" aria-hidden />
          </button>
          ) : null}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{projectName}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full border px-1.5 py-px text-[10px] tracking-wide uppercase",
                  toneClass[statusTone],
                )}
              >
                {statusLabel}
              </span>
              {saveLabel ? (
                <span className="truncate text-[11px] text-muted-foreground">{saveLabel}</span>
              ) : null}
            </div>
          </div>

          {/* Wraps onto a second line on a phone instead of sliding half of the
              actions off the edge of the screen. */}
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap [&_a]:whitespace-nowrap [&_button]:shrink-0 [&_button]:whitespace-nowrap">
            <UndoRedo />
            {actions}
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* -------------------------- Left nav -------------------------- */}
        {/* One-area workspaces (the builder) need no nav at all. */}
        <nav className={cn("hidden w-56 shrink-0", sections.length > 1 && "lg:block")}>
          <div className="sticky top-24 space-y-1">
            {sections.map((section) => (
              <NavItem
                key={section.key}
                section={section}
                active={section.key === active}
                onSelect={() => setActive(section.key)}
                showHint
              />
            ))}
          </div>
        </nav>

        {/* --------------------------- Canvas --------------------------- */}
        <div className={cn("min-w-0 flex-1 lg:pb-6", sections.length > 1 ? "pb-24" : "pb-6")}>
          {sections.length > 1 ? (
            <div className="mb-3 lg:hidden">
              <p className="eyebrow">{current?.label}</p>
            </div>
          ) : null}
          {current?.node}
        </div>
      </div>

      {/* --------------------- Mobile section sheet -------------------- */}
      {navOpen && sections.length > 1 ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close builder sections"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Builder sections</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setNavOpen(false)}
                className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="space-y-1">
              {sections.map((section) => (
                <NavItem
                  key={section.key}
                  section={section}
                  active={section.key === active}
                  onSelect={() => setActive(section.key)}
                  showHint
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------ Mobile bottom quick switcher ---------------- */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden",
          sections.length <= 1 && "hidden",
        )}
      >
        <nav
          aria-label="Builder modes"
          className="grid px-1 py-1.5"
          style={{ gridTemplateColumns: `repeat(${Math.max(sections.length, 1)}, minmax(0, 1fr))` }}
        >
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              aria-current={section.key === active ? "page" : undefined}
              onClick={() => setActive(section.key)}
              className={cn(
                "min-h-11 cursor-pointer rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                section.key === active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-elevated hover:text-foreground",
              )}
            >
              <span className="block truncate">{section.label}</span>
              {section.badge ? (
                <span className="mt-0.5 block text-[10px] text-accent">{section.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavItem({
  section,
  active,
  onSelect,
  showHint,
}: {
  section: BuilderSection;
  active: boolean;
  onSelect: () => void;
  showHint?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full cursor-pointer rounded-md border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary/50 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-elevated",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={cn("text-[13px] font-medium", active ? "text-primary" : "text-foreground")}
        >
          {section.label}
        </span>
        {section.badge ? (
          <span className="rounded-full bg-accent/15 px-1.5 text-[10px] text-accent">
            {section.badge}
          </span>
        ) : null}
      </span>
      {showHint && section.hint ? (
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{section.hint}</span>
      ) : null}
    </button>
  );
}
