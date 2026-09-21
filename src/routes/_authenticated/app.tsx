import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Pill } from "@/components/app/Bits";
import { useNotifications } from "@/lib/queries";
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

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [{ title: "Workspace — Revora" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AppShell,
});

const NAV_GROUPS = [
  {
    group: "Overview",
    items: [
      {
        to: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        key: false,
        hint: "Today's leads, bookings and revenue at a glance",
      },
      {
        to: "/app/command",
        label: "AI Command Center",
        icon: Sparkles,
        exact: false,
        key: true,
        hint: "Revora finds what's costing you work and fixes it",
      },
    ],
  },
  {
    group: "Win the work",
    items: [
      {
        to: "/app/website",
        label: "Website builder",
        icon: Globe,
        exact: false,
        key: true,
        hint: "Build the pages that turn visitors into enquiries",
      },
      {
        to: "/app/launch",
        label: "Launch checklist",
        icon: Rocket,
        exact: false,
        key: true,
        hint: "Everything that must be true before you go live",
      },
      {
        to: "/app/domain",
        label: "Domain & SSL",
        icon: Globe2,
        exact: false,
        key: false,
        hint: "Point your own web address at your site",
      },
    ],
  },
  {
    group: "Handle enquiries",
    items: [
      {
        to: "/app/leads",
        label: "Leads & CRM",
        icon: Users,
        exact: false,
        key: true,
        hint: "Every enquiry, its stage and what happens next",
      },
      {
        to: "/app/quotes",
        label: "Quote calculator",
        icon: Calculator,
        exact: false,
        key: false,
        hint: "Instant prices so people don't wait to hear back",
      },
      {
        to: "/app/calendar",
        label: "Calendar & bookings",
        icon: CalendarDays,
        exact: false,
        key: false,
        hint: "Jobs booked straight into your diary",
      },
      {
        to: "/app/automations",
        label: "Automations",
        icon: Zap,
        exact: false,
        key: false,
        hint: "Automatic follow-up so no lead goes cold",
      },
    ],
  },
  {
    group: "Grow",
    items: [
      {
        to: "/app/services",
        label: "Services",
        icon: Wrench,
        exact: false,
        key: false,
        hint: "What you sell, prices and what's bookable",
      },
      {
        to: "/app/reviews",
        label: "Reviews",
        icon: Star,
        exact: false,
        key: false,
        hint: "Ask happy customers and show the proof",
      },
      {
        to: "/app/campaigns",
        label: "Campaigns & QR",
        icon: QrCode,
        exact: false,
        key: false,
        hint: "Track where your enquiries come from",
      },
      {
        to: "/app/analytics",
        label: "Analytics",
        icon: BarChart3,
        exact: false,
        key: false,
        hint: "Visitors, calls, forms and conversion",
      },
    ],
  },
  {
    group: "Account",
    items: [
      {
        to: "/app/billing",
        label: "Billing",
        icon: CreditCard,
        exact: false,
        key: false,
        hint: "Your plan, setup fee and invoices",
      },
      {
        to: "/app/settings",
        label: "Settings",
        icon: Settings,
        exact: false,
        key: false,
        hint: "Business details, team and preferences",
      },
    ],
  },
] as const;

function AppShell() {
  const { data, isLoading } = useWorkspace();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const org = data?.workspace?.organization;
  const { data: notifications } = useNotifications(org?.id);
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;
  const { mode: supportMode } = useSupportMode();
  const endSupport = useServerFn(endSupportSession);
  const supporting = Boolean(data?.supporting && supportMode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: billing, isLoading: billingLoading } = useBillingState(org?.id);
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

  useEffect(() => {
    if (!isLoading && data && !data.workspace) navigate({ to: "/onboarding", replace: true });
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
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-background lg:flex">
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
        className={cn(
          "border-border bg-card",
          "fixed inset-y-0 left-0 z-50 flex w-[17.5rem] max-w-[86vw] flex-col overflow-y-auto overscroll-contain border-r shadow-2xl transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-60 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4">
          <Link to="/app" onClick={() => setNavOpen(false)}>
            <Logo />
          </Link>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="grid size-8 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav aria-label="App" className="flex flex-1 flex-col gap-4 p-2.5">
          {NAV_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <p className="eyebrow px-2.5 pb-1.5">{group}</p>
              <div className="flex flex-col gap-0.5">
                {items.map(({ to, label, icon: Icon, exact, key, hint }) => (
                  <Link
                    key={to}
                    to={to}
                    activeOptions={{ exact }}
                    onClick={() => setNavOpen(false)}
                    title={hint}
                    className="group relative flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                    activeProps={{
                      className: "border-primary/35 bg-primary/10 text-primary",
                      "aria-current": "page",
                    }}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {key ? (
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-primary/70"
                      />
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {org ? (
          <div className="mx-2.5 mt-2 rounded-md border border-border p-3">
            <p className="eyebrow">Your site</p>
            <p className="mt-1 truncate text-[13px] font-medium">{org.name}</p>
            <Link
              to="/s/$slug"
              params={{ slug: org.slug }}
              target="_blank"
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
            >
              View live site <ExternalLink className="size-3" />
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
          <button
            type="button"
            onClick={async () => {
              writeSupportMode(null);
              await signOut();
              navigate({ to: "/auth", replace: true });
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
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

        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="grid size-9 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground lg:hidden"
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              {navOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <LogoMark className="lg:hidden" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate font-display text-[14px] font-semibold">
                {org ? `Welcome back, ${org.name}` : "Your business"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {supporting
                  ? "Platform support session"
                  : data?.workspace?.role
                    ? `Signed in as ${data.workspace.role}`
                    : "Loading…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {trialStillActive && countdown ? (
              <Pill tone="attention">
                <span className="whitespace-nowrap">
                  Free access ·{" "}
                  <span className="tnum font-semibold" aria-live="off">
                    {countdown.label}
                  </span>
                </span>
              </Pill>
            ) : org?.subscription_status === "trialing" ? (
              <Pill tone="attention">Trial</Pill>
            ) : null}
            {org?.is_demo ? <Pill tone="info">Demo data</Pill> : null}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                aria-label="Notifications"
                aria-expanded={bellOpen}
                className="relative grid size-9 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <Bell className="size-4" />
                {unread > 0 ? (
                  <span className="tnum absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </button>
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
            <Button asChild variant="signal" size="sm" className="hidden sm:inline-flex">
              <Link to="/app/leads">Work the board</Link>
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {billingLoading && org ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground">
              Checking workspace access…
            </div>
          ) : paymentLocked ? (
            <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
              <p className="eyebrow">Access paused</p>
              <h1 className="mt-2 font-display text-2xl font-bold">
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
                <a href="mailto:Revorabusiness0@gmail.com" className="text-primary hover:underline">
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
