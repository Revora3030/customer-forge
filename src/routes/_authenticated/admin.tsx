import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  BarChart3,
  DatabaseBackup,
  Building2,
  ClipboardList,
  CreditCard,
  Globe2,
  LayoutGrid,
  LineChart,
  Megaphone,
  LifeBuoy,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill } from "@/components/app/Bits";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/app/WorkspaceNav";
import { useSignOut, useWorkspace } from "@/lib/use-tenant";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Platform admin — Revora" },
      {
        name: "description",
        content: "Create, launch and support client businesses on the platform.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminShell,
});

const PRIMARY_NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/admin/clients", label: "Clients", icon: Building2, exact: false },
  { to: "/admin/websites", label: "Websites", icon: ClipboardList, exact: false },
  { to: "/admin/monitoring", label: "Monitoring", icon: Activity, exact: false },
] satisfies readonly WorkspaceNavItem[];

const SECONDARY_NAV = [
  { to: "/admin/analytics", label: "Analytics", icon: LineChart, exact: false },
  { to: "/admin/outreach", label: "Outreach", icon: Megaphone, exact: false },
  { to: "/admin/monthly", label: "Monthly", icon: BarChart3, exact: false },
  { to: "/admin/domains", label: "Domains", icon: Globe2, exact: false },
  { to: "/admin/plans", label: "Plans", icon: Receipt, exact: false },
  { to: "/admin/payments", label: "Payments", icon: CreditCard, exact: false },
  { to: "/admin/backups", label: "Backups", icon: DatabaseBackup, exact: false },
  { to: "/admin/seo", label: "Search growth", icon: Search, exact: false },
  { to: "/admin/ai", label: "AI health", icon: Sparkles, exact: false },
] satisfies readonly WorkspaceNavItem[];

function AdminShell() {
  const { data, isLoading } = useWorkspace();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [navOpen, setNavOpen] = useState(false);

  if (isLoading) {
    return <div className="p-10 text-[13px] text-muted-foreground">Checking your access…</div>;
  }

  if (!data?.isSuperAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title="Platform administration"
          description="This area is for platform staff only. Your business workspace has everything you need."
          action={
            <Button asChild variant="signal" size="sm">
              <Link to="/app">Go to my workspace</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="product-workspace min-h-screen lg:flex">
      {navOpen ? (
        <button type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" />
      ) : null}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[86vw] flex-col border-r border-border bg-card transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-56 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link to="/admin" onClick={() => setNavOpen(false)}><Logo /></Link>
          <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(false)} className="lg:hidden" aria-label="Close navigation"><X className="size-4" /></Button>
        </div>
        <div className="px-3 pt-3"><Pill tone="info"><ShieldCheck className="size-3" /> Platform admin</Pill></div>
        <WorkspaceNav primary={PRIMARY_NAV} secondary={SECONDARY_NAV} secondaryLabel="More tools" onNavigate={() => setNavOpen(false)} className="flex-1" />
        <div className="border-t border-border p-2">
          <Link to="/app" className="flex min-h-10 items-center gap-3 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-elevated hover:text-foreground"><LifeBuoy className="size-4" /> My workspace</Link>
          <button type="button" onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-elevated hover:text-foreground">Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(true)} className="lg:hidden" aria-label="Open navigation"><Menu className="size-4" /></Button>
          <p className="text-[13px] font-medium">Platform workspace</p>
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><LifeBuoy className="size-3.5" /> Support access is audited</span>
        </header>
        <main className="product-canvas px-4 py-5 sm:px-6 sm:py-6"><Outlet /></main>
      </div>
    </div>
  );
}
