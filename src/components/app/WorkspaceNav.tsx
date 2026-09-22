import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className="flex min-h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
      activeProps={{ className: "bg-elevated text-foreground", "aria-current": "page" }}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
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
  return (
    <nav aria-label="Workspace" className={cn("space-y-1 p-2", className)}>
      {primary.map((item) => (
        <NavLink key={item.to} item={item} {...(onNavigate ? { onNavigate } : {})} />
      ))}
      {secondary?.length ? (
        <details className="group pt-1">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground [&::-webkit-details-marker]:hidden">
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
    </nav>
  );
}