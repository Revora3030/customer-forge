import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ExternalLink,
  Globe,
  Globe2,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  QrCode,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Star,
  Users,
  Wrench,
  X,
  Calculator,
  Zap,
  CreditCard,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { LiveDot, Pill } from "@/components/app/Bits";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/app/WorkspaceNav";
import { useNotifications, useWebsiteSettings, useWorkspaceRealtime } from "@/lib/queries";
import { useSignOut, useWorkspace } from "@/lib/use-tenant";
import { endSupportSession } from "@/lib/admin.functions";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { useSupportMode, writeSupportMode } from "@/lib/support-mode";
import { dateLong, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBillingState } from "@/lib/stripe.hooks";
import { trialEndsAtMs } from "@/lib/trial";
import { useTrialCountdown } from "@/lib/trial-clock";
import { useQueryClient } from "@tanstack/react-query";
import { RouteError } from "@/components/app/RouteStates";
import { WorkspaceSkeleton } from "@/components/app/WorkspaceSkeleton";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [{ title: "Workspace — Revora" },
      { name: "description", content: "Manage your Revora business workspace." },
      { property: "og:title", content: "Workspace — Revora" },
      { property: "og:description", content: "Manage your Revora business workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AppShell,
  errorComponent: RouteError,
});

const PRIMARY_NAV = [
      {
        to: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        hint: "Today's leads, bookings and revenue at a glance",
      },
      {
        to: "/app/website",
        label: "Website",
        icon: Globe,
        exact: false,
        hint: "Build the pages that turn visitors into enquiries",
      },
      {
        to: "/app/command",
        label: "Revora AI",
        icon: Sparkles,
        exact: false,
        hint: "Find and fix what is costing you work",
      },
      {
        to: "/app/leads",
        label: "Leads",
        icon: Users,
        exact: false,
        hint: "Every enquiry, its stage and what happens next",
      },
] satisfies readonly WorkspaceNavItem[];

const SECONDARY_NAV = [
      {
        to: "/app/quotes",
        label: "Quotes",
        icon: Calculator,
        exact: false,
        hint: "Instant prices so people don't wait to hear back",
      },
      {
        to: "/app/calendar",
        label: "Calendar",
        icon: CalendarDays,
        exact: false,
        hint: "Jobs booked straight into your diary",
      },
      {
        to: "/app/automations",
        label: "Automations",
        icon: Zap,
        exact: false,
        hint: "Automatic follow-up so no lead goes cold",
      },
      {
        to: "/app/services",
        label: "Services",
        icon: Wrench,
        exact: false,
        hint: "What you sell, prices and what's bookable",
      },
      {
        to: "/app/reviews",
        label: "Reviews",
        icon: Star,
        exact: false,
        hint: "Ask happy customers and show the proof",
      },
      {
        to: "/app/campaigns",
        label: "Campaigns",
        icon: QrCode,
        exact: false,
        hint: "Track where your enquiries come from",
      },
      {
        to: "/app/analytics",
        label: "Analytics",
        icon: BarChart3,
        exact: false,
        hint: "Visitors, calls, forms and conversion",
      },
      {
        to: "/app/launch",
        label: "Launch",
        icon: Rocket,
        exact: false,
        hint: "Everything that must be true before you go live",
      },
      {
        to: "/app/domain",
        label: "Domain",
        icon: Globe2,
        exact: false,
        hint: "Point your own web address at your site",
      },
      {
        to: "/app/billing",
        label: "Billing",
        icon: CreditCard,
        exact: false,
        hint: "Your plan, setup fee and invoices",
      },
      {
        to: "/app/settings",
        label: "Settings",
        icon: Settings,
        exact: false,
        hint: "Business details, team and preferences",
      },
] satisfies readonly WorkspaceNavItem[];

function AppShell() {
  const { data, isLoading } = useWorkspace();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [navOpen, setNavOpen] = useState(false);
  const [desktopNav, setDesktopNav] = useState(false);
  const navPanel = useRef<HTMLElement>(null);
  const navTrigger = useRef<HTMLButtonElement>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const org = data?.workspace?.organization;
  const { data: notifications } = useNotifications(org?.id);
  useWorkspaceRealtime(org?.id);
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;
  const { mode: supportMode } = useSupportMode();
  const endSupport = useServerFn(endSupportSession);
  const supporting = Boolean(data?.supporting && supportMode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentPage = [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to),
  );
  const { data: billing, isLoading: billingLoading } = useBillingState(org?.id);
  // The public /s/<slug> address only serves a published site; before that it
  // says "Business not found". Unpublished workspaces get their draft preview.
  const { data: siteSettings } = useWebsiteSettings(org?.id);
  const siteLive = siteSettings?.publish_state === "published";
  // Per-client countdown: derived from this workspace's own trial_ends_at, so
  // two clients signing up minutes apart each see their own real deadline.
  const trialEnd = trialEndsAtMs(org);
  const countdown = useTrialCountdown(trialEnd);
  const trialStillActive = Boolean(countdown && !countdown.expired);

  const paidAccess = Boolean(
    org &&
    (org.setup_paid_at ||
      org.subscription_status === "active" ||
      org.subscription_status === "past_due"),
  );
  const paymentRequired = Boolean(
    org &&
    !org.is_demo &&
    !billing?.active &&
    !paidAccess &&
    !trialStillActive &&
    !data?.isSuperAdmin &&
    !supporting,
  );
  const paymentLocked = paymentRequired && !pathname.startsWith("/app/billing");
  // Only wait on the billing lookup when it can actually change access. Demo
  // workspaces, paid workspaces, active trials, platform admins and support
  // sessions are open regardless, and used to sit on "Checking workspace
  // access…" (e.g. /app/launch) while billing loaded or retried.
  const billingDecidesAccess = Boolean(
    org && !org.is_demo && !paidAccess && !trialStillActive && !data?.isSuperAdmin && !supporting,
  );
  const waitingOnBilling = billingLoading && billingDecidesAccess;

  useEffect(() => {
    // One onboarding door: an account without a workspace goes to /get-started.
    if (!isLoading && data && !data.workspace) navigate({ to: "/get-started", replace: true });
  }, [data, isLoading, navigate]);

  const queryClient = useQueryClient();
  const trialExpired = Boolean(countdown?.expired);
  useEffect(() => {
    if (!trialExpired || !org?.id) return;
    // The clock just ran out: re-read billing/workspace state so the paywall
    // reflects the server's own entitlement decision.
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    void queryClient.invalidateQueries({ queryKey: ["billing_state", org.id] });
  }, [trialExpired, org?.id, queryClient]);

  // Close the mobile drawer on route change, on Escape, and lock page scroll
  // while it is open so it behaves like a real app drawer.
  useEffect(() => {
    setNavOpen(false);
    setBellOpen(false);
  }, [pathname]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
      if (e.key === "Tab") {
        const elements = focusables();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      trigger?.focus();
    };
  }, [navOpen]);

  if (isLoading || !data?.workspace?.organization) {
    return (
      <WorkspaceSkeleton
        title="Preparing your workspace"
        body="We’re making sure your account, business profile and secure workspace are ready before the dashboard renders."
      />
    );
  }

  return (
    <div className="min-h-screen bg-background/76 backdrop-blur-[2px] lg:flex">
      {/* Mobile drawer backdrop */}
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-background/80 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      {/* Sidebar */}
      <aside
        ref={navPanel}
        id="workspace-navigation"
        role={navOpen ? "dialog" : undefined}
        aria-modal={navOpen ? true : undefined}
        aria-label="Workspace navigation"
        inert={!navOpen && !desktopNav}
        className={cn(
          "border-border bg-card",
          "fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[16rem] max-w-[86vw] flex-col overflow-y-auto overscroll-contain border-r pb-[env(safe-area-inset-bottom)] shadow-lift transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-56 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:pb-0 lg:shadow-none",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="sticky top-0 z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] lg:h-16 lg:pt-0">
          <Link to="/app" onClick={() => setNavOpen(false)}>
            <Logo />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden"
          >
            <X className="size-4" />
          </Button>
        </div>
        <WorkspaceNav
          primary={PRIMARY_NAV}
          secondary={SECONDARY_NAV}
          secondaryLabel="More tools"
          onNavigate={() => setNavOpen(false)}
          className="shrink-0"
        />
        <div className="flex-1" aria-hidden="true" />

        {org ? (
          <div className="mx-2.5 mt-2 rounded-md border border-border p-3">
            <p className="eyebrow">Your site</p>
            <p className="mt-1 truncate text-[13px] font-medium">{org.name}</p>
            <Link
              to={siteLive ? "/s/$slug" : "/draft/$slug"}
              params={{ slug: org.slug }}
              target="_blank"
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
            >
              {siteLive ? "View live site" : "Preview draft site"} <ExternalLink className="size-3" />
            </Link>
          </div>
        ) : null}

        {data?.isSuperAdmin ? (
          <div className="p-2.5">
            <Link
              to="/admin"
              onClick={() => setNavOpen(false)}
              className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
            >
              <Shield className="size-4" aria-hidden="true" /> Platform admin
            </Link>
          </div>
        ) : null}

        <div className="p-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              writeSupportMode(null);
              await signOut();
              navigate({ to: "/auth", replace: true });
            }}
            className="w-full justify-start text-[13px]"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {supporting && supportMode ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/40 bg-accent/15 px-4 py-2.5">
            <p className="flex items-center gap-2 text-[12px]">
              <LifeBuoy className="size-4 text-accent" aria-hidden="true" />
              <span>
                <strong>Support mode</strong> — you are working inside{" "}
                {supportMode.organizationName}. This session started{" "}
                {dateLong(supportMode.startedAt)} and is recorded in the audit log.
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await endSupport({ data: { sessionId: supportMode.sessionId } });
                writeSupportMode(null);
                navigate({
                  to: "/admin/clients/$orgId",
                  params: { orgId: supportMode.organizationId },
                });
              }}
            >
              End support session
            </Button>
          </div>
        ) : null}

        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={navOpen}
              aria-controls="workspace-navigation"
              ref={navTrigger}
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
            <LogoMark className="size-8" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">
                {currentPage?.label ?? "Workspace"}
              </p>
              <p className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
                {supporting ? "Support session" : (org?.name ?? "Your business")}
                <LiveDot label="Live" />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {trialStillActive && countdown ? (
              <Pill tone="attention">
                <span className="whitespace-nowrap">
                  <span className="hidden min-[400px]:inline">Free access · </span>
                  <span className="tnum font-semibold" aria-live="off">
                    {countdown.label}
                  </span>
                </span>
              </Pill>
            ) : paymentRequired && org?.subscription_status === "trialing" ? (
              // Only when the trial really blocks this workspace (no payment,
              // plan, admin or support access keeps it open), and one tap
              // from fixing it.
              <Link
                to="/app/billing"
                aria-label="Trial ended — open billing"
                className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Pill tone="attention">Trial ended</Pill>
              </Link>
            ) : null}
            {org?.is_demo ? <Pill tone="info">Demo data</Pill> : null}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setBellOpen((v) => !v)}
                aria-label="Notifications"
                aria-expanded={bellOpen}
                className="relative"
              >
                <Bell className="size-4" />
                {unread > 0 ? (
                  <span className="tnum absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Button>
              {bellOpen ? (
                <div className="panel absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] p-0">
                  <p className="eyebrow border-b border-border px-3.5 py-2.5">Activity</p>
                  <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                    {(notifications ?? []).slice(0, 12).map((n) => (
                      <li key={n.id} className="px-3.5 py-2.5">
                        <p className="text-[13px] font-medium">{n.title}</p>
                        {n.body ? (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">{n.body}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {relative(n.created_at)}
                        </p>
                      </li>
                    ))}
                    {(notifications ?? []).length === 0 ? (
                      <li className="px-3.5 py-6 text-center text-[13px] text-muted-foreground">
                        Nothing yet. New leads and bookings show up here.
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="product-canvas px-4 py-5 sm:px-6 sm:py-6">
          {waitingOnBilling ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground">
              Checking workspace access…
            </div>
          ) : paymentLocked ? (
            <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
              <p className="eyebrow">Access paused</p>
              <h1 className="mt-2 font-editorial text-[30px] leading-tight">
                Activate your Revora Growth System
              </h1>
              <p className="mt-3 text-[14px] text-muted-foreground">
                Your {GROWTH_SYSTEM.fullAccessWindow} free full-access trial has ended. Your
                website, leads, bookings, and settings are saved — nothing is lost. Pay the{" "}
                {usd(GROWTH_SYSTEM.setupPrice)} one-time setup to restore full access; your first
                month of the {usd(GROWTH_SYSTEM.monthlyPrice)}/month platform fee is free, then it
                continues at {usd(GROWTH_SYSTEM.monthlyPrice)}/month from month two unless canceled.
              </p>

              <Button asChild variant="signal" className="mt-6">
                <Link to="/app/billing">
                  <CreditCard className="size-4" aria-hidden="true" /> Activate my system
                </Link>
              </Button>

              <p className="mt-4 text-[12px] text-muted-foreground">
                Questions?{" "}
                <a href="mailto:hello@revoragrowthsystems.com" className="text-primary hover:underline">
                  Email support
                </a>{" "}
                or{" "}
                <a href="tel:+19196226620" className="text-primary hover:underline">
                  call (919) 622-6620
                </a>
                .
              </p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
