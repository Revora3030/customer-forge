import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
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
import { EmptyState, LiveDot, Pill } from "@/components/app/Bits";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/app/WorkspaceNav";
import { JarvisDock } from "@/components/app/JarvisDock";
import { useSignOut, useWorkspace } from "@/lib/use-tenant";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Platform admin — Revora" },
      { property: "og:title", content: "Platform admin — Revora" },
      { property: "og:description", content: "Create, launch and support client businesses on the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  { to: "/admin/city", label: "AI City", icon: Building2, exact: false },
  { to: "/admin/jarvis", label: "Jarvis", icon: Bot, exact: false },
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
  { to: "/admin/growth", label: "Growth Engine", icon: Sparkles, exact: false },
  { to: "/admin/command", label: "AI Command Center", icon: Sparkles, exact: false },
  { to: "/admin/ai", label: "AI health", icon: Sparkles, exact: false },
] satisfies readonly WorkspaceNavItem[];

function AdminShell() {
  const { data, isLoading } = useWorkspace();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [navOpen, setNavOpen] = useState(false);
  const [desktopNav, setDesktopNav] = useState(false);
  const navPanel = useRef<HTMLElement>(null);
  const navTrigger = useRef<HTMLButtonElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => { setDesktopNav(media.matches); if (media.matches) setNavOpen(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!navOpen) return;
    const panel = navPanel.current;
    const trigger = navTrigger.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), summary, [tabindex="0"]',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
      if (event.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [navOpen]);

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
      <aside ref={navPanel} id="admin-navigation" role={navOpen ? "dialog" : undefined} aria-modal={navOpen ? true : undefined} aria-label="Platform navigation" inert={!navOpen && !desktopNav} className={`fixed inset-y-0 left-0 z-50 pt-[env(safe-area-inset-top)] lg:pt-0 flex h-[100dvh] w-64 max-w-[86vw] flex-col overflow-y-auto overscroll-contain border-r border-border bg-card transition-transform motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-56 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link to="/admin" onClick={() => setNavOpen(false)}><Logo /></Link>
          <Button variant="ghost" size="icon" onClick={() => setNavOpen(false)} className="min-h-11 min-w-11 lg:hidden" aria-label="Close navigation"><X className="size-4" /></Button>
        </div>
        <div className="px-3 pt-3"><Pill tone="info"><ShieldCheck className="size-3" /> Platform admin</Pill></div>
        <WorkspaceNav primary={PRIMARY_NAV} secondary={SECONDARY_NAV} secondaryLabel="More tools" onNavigate={() => setNavOpen(false)} className="flex-1" />
        <div className="border-t border-border p-2">
          <Link to="/app" className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-elevated hover:text-foreground"><LifeBuoy className="size-4" /> My workspace</Link>
          <Button variant="ghost" onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }} className="min-h-11 w-full justify-start px-3 text-[13px] text-muted-foreground">Sign out</Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button ref={navTrigger} variant="ghost" size="icon" onClick={() => setNavOpen(true)} className="min-h-11 min-w-11 lg:hidden" aria-label="Open navigation" aria-expanded={navOpen} aria-controls="admin-navigation"><Menu className="size-4" /></Button>
          <p className="text-[13px] font-medium">Platform workspace</p>
          <LiveDot label="Live data" />
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><LifeBuoy className="size-3.5" /> Support access is audited</span>
        </header>
        <main className="product-canvas px-4 py-5 sm:px-6 sm:py-6"><Outlet /></main>
      </div>
      <JarvisDock />
    </div>
  );
}
