import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, Mail, Menu, Phone, Sparkles, X } from "lucide-react";
import { useSession } from "@/lib/auth-session";
import { useSignOut } from "@/lib/use-tenant";
import { MAIL_SUBJECTS, REVORA, revoraMailto, revoraTel } from "@/lib/brand";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { MarketingConversionKit } from "@/components/marketing/ConversionKit";
import { AuthActions, SIGN_IN_SEARCH, SIGN_UP_SEARCH } from "@/components/marketing/AuthButtons";

const NAV = [
  { to: "/demo", label: "Product" },
  { to: "/industries", label: "Solutions" },
  { to: "/", hash: "how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { loading, user } = useSession();
  const signOut = useSignOut();
  const signedIn = !loading && user !== null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" aria-label="Revora home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              {...("hash" in item ? { hash: item.hash } : {})}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
              activeProps={{ className: "bg-elevated text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void signOut()}
                title="Sign out of Revora"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                Sign out
              </Button>
              <Button asChild variant="signal" size="sm">
                <Link to="/app">
                  <LayoutDashboard className="size-3.5" aria-hidden="true" />
                  My dashboard
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth" search={SIGN_IN_SEARCH} className="text-primary">
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="signal" size="sm">
                <Link to="/auth" search={SIGN_UP_SEARCH}>
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Start free
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* On a phone the two doors stay visible next to the menu button, so
            signing in never requires opening the menu first. */}
        <div className="flex items-center gap-1.5 md:hidden">
          <AuthActions variant="compact" />
          <button
            type="button"
            className="grid size-10 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-card px-4 py-2 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col divide-y divide-border">
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                {...("hash" in item ? { hash: item.hash } : {})}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center py-2.5 text-sm text-muted-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            {signedIn ? (
              <>
                <Button asChild variant="signal">
                  <Link to="/app" onClick={() => setOpen(false)}>
                    <LayoutDashboard className="size-3.5" aria-hidden="true" />
                    My dashboard
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut className="size-3.5" aria-hidden="true" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="signal">
                  <Link to="/auth" search={SIGN_UP_SEARCH} onClick={() => setOpen(false)}>
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {`Start free — ${GROWTH_SYSTEM.fullAccessWindow} full access`}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link
                    to="/auth"
                    search={SIGN_IN_SEARCH}
                    onClick={() => setOpen(false)}
                    className="text-primary"
                  >
                    Sign in
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

const FOOTER_GROUPS = [
  {
    heading: "Platform",
    links: [
      { to: "/demo", label: "Product tour" },
      { to: "/industries", label: "Solutions" },
      { to: "/states", label: "All 50 states" },
      { to: "/locations", label: "North Carolina" },
      { to: "/pricing", label: "Pricing" },
      { to: "/growth-assessment", label: "Free growth assessment" },
      { to: "/website-audit", label: "Free website audit" },
    ],
  },
  {
    heading: "Free resources",
    links: [
      { to: "/tools", label: "Free calculators" },
      { to: "/guides", label: "Growth guides" },
      { to: "/compare", label: "Compare options" },
      { to: "/local", label: "By trade & state" },
    ],
  },

  {
    heading: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
      { to: "/privacy", label: "Privacy policy" },
      { to: "/terms", label: "Terms of service" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-28">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Logo tagline />
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              One system to get discovered, capture opportunities, convert leads, book customers and
              measure growth.
            </p>
            <div className="mt-6">
              <p className="eyebrow">Contact</p>
              <ul className="mt-1 text-[13px] sm:mt-2.5 sm:space-y-2">
                <li className="flex items-center gap-2">
                  <Mail className="size-3.5 text-primary" aria-hidden="true" />
                  <a
                    href={revoraMailto(MAIL_SUBJECTS.inquiry)}
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    {REVORA.email}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="size-3.5 text-primary" aria-hidden="true" />
                  <a
                    href={revoraTel}
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    {REVORA.phoneDisplay}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 md:col-span-7">
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <p className="eyebrow">{group.heading}</p>
                <ul className="mt-1 text-[13px] sm:mt-3 sm:space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <nav aria-label="Get started">
              <p className="eyebrow">Get started</p>
              <ul className="mt-1 text-[13px] sm:mt-3 sm:space-y-2.5">
                <li>
                  <Link
                    to="/get-started"
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    Start my Revora system
                  </Link>
                </li>

                <li>
                  <Link
                    to="/auth"
                    search={SIGN_UP_SEARCH}
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    Create a free account
                  </Link>
                </li>
                <li>
                  <Link
                    to="/auth"
                    search={SIGN_IN_SEARCH}
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/share"
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    Share Revora
                  </Link>
                </li>
                <li>
                  <Link
                    to="/s/$slug"
                    params={{ slug: "elite-mobile-detailing" }}
                    className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-primary sm:min-h-0"
                  >
                    Live demo site
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} <span className="text-foreground">REVORA™</span> — The
            Business Growth Operating System
          </p>
          <p className="text-[11px] text-muted-foreground">
            Estimated opportunity figures are estimates, not guaranteed revenue.
          </p>
        </div>
      </div>
      <MarketingConversionKit />
    </footer>
  );
}
