/**
 * Standalone client portal app.
 *
 * This is the app a Revora client opens in their own browser: their website,
 * their leads, their bookings and their setup steps — without the builder's
 * tooling around it. It reads the same workspace data the builder writes, so
 * what a client sees here always matches what is live.
 */
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck, Globe, Home, LogOut, Menu, Rocket, Users, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useSignOut, useWorkspace } from "@/lib/use-tenant";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/app/WorkspaceNav";

export const Route = createFileRoute("/_authenticated/my")({
  head: () => ({
    meta: [
      { title: "My Revora portal — website, leads and bookings" },
      {
        name: "description",
        content:
          "Your own Revora portal: see your live website, the leads and bookings it captured, and the steps left to finish setup.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalApp,
});

const NAV = [
  { to: "/my", label: "Home", icon: Home, exact: true },
  { to: "/my/site", label: "My website", icon: Globe, exact: false },
  { to: "/my/activity", label: "Leads & bookings", icon: Users, exact: false },
  { to: "/my/start", label: "Setup steps", icon: Rocket, exact: false },
] satisfies readonly WorkspaceNavItem[];

function PortalApp() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const signOut = useSignOut();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="product-workspace min-h-screen lg:flex">
      {navOpen ? <button type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[86vw] flex-col border-r border-border bg-card transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-56 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <LogoMark className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{org?.name ?? "Your business"}</p><p className="text-[11px] text-muted-foreground">Client portal</p></div>
          <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(false)} className="lg:hidden" aria-label="Close navigation"><X className="size-4" /></Button>
        </div>
        <WorkspaceNav primary={NAV} onNavigate={() => setNavOpen(false)} className="flex-1" />
        <div className="border-t border-border p-2">
          <Link to="/app" className="flex min-h-10 items-center gap-3 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-elevated hover:text-foreground"><CalendarCheck className="size-4" /> Full workspace</Link>
          <button type="button" onClick={() => void signOut()} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-elevated hover:text-foreground"><LogOut className="size-4" /> Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu className="size-4" /></Button>
          <p className="truncate text-[13px] font-medium">{org?.name ?? "Your business"}</p>
        </header>
        <main className="product-canvas min-h-[calc(100vh-3.5rem)] px-4 py-5 sm:px-6 sm:py-6"><Outlet /></main>
      </div>
    </div>
  );
}
