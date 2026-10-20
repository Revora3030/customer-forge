/**
 * Standalone client portal app.
 *
 * This is the app a Revora client opens in their own browser: their website,
 * their leads, their bookings and their setup steps — without the builder's
 * tooling around it. It reads the same workspace data the builder writes, so
 * what a client sees here always matches what is live.
 */
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Globe, Home, LogOut, Menu, Rocket, Users, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useSignOut, useWorkspace } from "@/lib/use-tenant";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/app/WorkspaceNav";

export const Route = createFileRoute("/_authenticated/my")({
  head: () => ({
    meta: [
      { title: "My Revora portal — website, leads and bookings" },
      { property: "og:title", content: "My Revora portal — website, leads and bookings" },
      { property: "og:description", content: "Your own Revora portal: see your live website, the leads and bookings it captured, and the steps left to finish setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

  return (
    <div className="product-workspace min-h-screen lg:flex">
      {navOpen ? <button type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" /> : null}
      <aside ref={navPanel} id="portal-navigation" role={navOpen ? "dialog" : undefined} aria-modal={navOpen ? true : undefined} aria-label="Client portal navigation" inert={!navOpen && !desktopNav} className={`fixed inset-y-0 left-0 z-50 pt-[env(safe-area-inset-top)] lg:pt-0 flex h-[100dvh] w-64 max-w-[86vw] flex-col overflow-y-auto overscroll-contain border-r border-border bg-card transition-transform motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-56 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <LogoMark className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{org?.name ?? "Your business"}</p><p className="text-[11px] text-muted-foreground">Client portal</p></div>
          <Button variant="ghost" size="icon" onClick={() => setNavOpen(false)} className="min-h-11 min-w-11 lg:hidden" aria-label="Close navigation"><X className="size-4" /></Button>
        </div>
        <WorkspaceNav primary={NAV} onNavigate={() => setNavOpen(false)} className="flex-1" />
        <div className="border-t border-border p-2">
          <Link to="/app" className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-elevated hover:text-foreground"><CalendarCheck className="size-4" /> Full workspace</Link>
          <Button variant="ghost" onClick={() => void signOut()} className="min-h-11 w-full justify-start gap-3 px-3 text-[13px] text-muted-foreground"><LogOut className="size-4" /> Sign out</Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Button ref={navTrigger} variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="portal-navigation"><Menu className="size-4" /></Button>
          <p className="truncate text-[13px] font-medium">{org?.name ?? "Your business"}</p>
        </header>
        <main className="product-canvas min-h-[calc(100vh-3.5rem)] px-4 py-5 sm:px-6 sm:py-6"><Outlet /></main>
      </div>
    </div>
  );
}
