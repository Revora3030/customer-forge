import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { WHATS_NEW_SEEN_KEY, hasUnreadEntry } from "@/lib/whats-new";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  hint?: string;
};

function NavLink({ item, onNavigate }: { item: WorkspaceNavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      {...(item.exact === undefined ? {} : { activeOptions: { exact: item.exact } })}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      {...(item.hint ? { title: item.hint } : {})}
      className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      activeProps={{ className: "bg-elevated text-foreground", "aria-current": "page" }}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function WhatsNewLink({ onNavigate }: { onNavigate?: () => void }) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    let seen: string | null = null;
    try { seen = window.localStorage.getItem(WHATS_NEW_SEEN_KEY); } catch { /* storage blocked */ }
    setUnread(hasUnreadEntry(seen));
  }, []);
  return (
    <Link
      to="/whats-new"
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="min-w-0 flex-1 truncate">What's new</span>
      {unread ? <span className="size-2 rounded-full bg-primary" aria-label="New updates" /> : null}
    </Link>
  );
}

export function WorkspaceNav({
  primary,
  secondary,
  secondaryLabel = "More",
  onNavigate,
  className,
}: {
  primary: readonly WorkspaceNavItem[];
  secondary?: readonly WorkspaceNavItem[];
  secondaryLabel?: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const secondaryActive = secondary?.some((item) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  return (
    <nav aria-label="Workspace" className={cn("space-y-1 p-2", className)}>
      {primary.map((item) => (
        <NavLink key={item.to} item={item} {...(onNavigate ? { onNavigate } : {})} />
      ))}
      {secondary?.length ? (
        <details key={pathname} open={secondaryActive} className="group pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            <span>{secondaryLabel}</span>
          </summary>
          <div className="mt-1 space-y-1 border-l border-border pl-2">
            {secondary.map((item) => (
              <NavLink key={item.to} item={item} {...(onNavigate ? { onNavigate } : {})} />
            ))}
          </div>
        </details>
      ) : null}
      <WhatsNewLink {...(onNavigate ? { onNavigate } : {})} />
    </nav>
  );
}