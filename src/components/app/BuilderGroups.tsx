/**
 * Grouping helpers for the builder workspace.
 *
 * `GroupTabs` turns a long scrolling settings list into a small number of
 * plain-language groups (progressive disclosure) without removing any control,
 * and `EmptyHint` gives every workspace a useful empty state. Both are
 * presentation only — no builder logic lives here.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BuilderGroup = { key: string; label: string; node: ReactNode };

export function GroupTabs({
  groups,
  label,
  initialKey,
}: {
  groups: BuilderGroup[];
  /** Accessible name for the group switcher, e.g. "Design groups". */
  label: string;
  initialKey?: string;
}) {
  const [active, setActive] = useState(initialKey ?? groups[0]?.key ?? "");
  const current = groups.find((group) => group.key === active) ?? groups[0];
  const activeIndex = Math.max(
    0,
    groups.findIndex((group) => group.key === current?.key),
  );

  /** One keyboard vocabulary for every group switcher in the builder. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const last = groups.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowLeft"
            ? (activeIndex + last) % groups.length
            : (activeIndex + 1) % groups.length;
    const target = groups[next];
    if (!target) return;
    setActive(target.key);
    const node = document.getElementById(`builder-group-tab-${target.key}`);
    node?.focus();
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {groups.map((group) => {
          const isActive = group.key === current?.key;
          return (
            <button
              key={group.key}
              id={`builder-group-tab-${group.key}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`builder-group-panel-${group.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(group.key)}
              className={cn(
                "min-h-9 shrink-0 snap-start cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                isActive
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-elevated hover:text-foreground",
              )}
            >
              {group.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`builder-group-panel-${current?.key ?? ""}`}
        {...(current ? { "aria-labelledby": `builder-group-tab-${current.key}` } : {})}
        tabIndex={-1}
        className="space-y-5"
      >
        {current?.node}
      </div>
    </div>
  );
}

export function EmptyHint({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="panel p-5 text-center">
      <p className="text-[13.5px] font-medium">{title}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p> : null}
      {actionLabel && onAction ? (
        <Button className="mt-3" size="sm" variant="signal" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Presents groups in a deliberate order — the order an owner works in
 * (look, words, photos, enquiries, pages, checks, go live) — instead of the
 * order the code happens to declare them in. Anything not named keeps its
 * original position at the end, so a new group is never silently hidden.
 */
export function orderGroups(groups: BuilderGroup[], order: string[]): BuilderGroup[] {
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return [...groups].sort((a, b) => rank(a.key) - rank(b.key));
}
