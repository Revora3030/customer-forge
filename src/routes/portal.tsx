/**
 * Public client portal landing page.
 *
 * Clients land here from the pricing page (or a shared portal link), create
 * their Revora account, enter the workspace portal code and join themselves —
 * no manual invite required. Everything sensitive happens server-side in
 * `portal.functions.ts`; this page only collects the code.
 */
import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CalendarCheck, Globe, KeyRound, Users } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  PORTAL_CODE_LENGTH,
  joinWithPortalCode,
  normalizePortalCode,
} from "@/lib/portal.functions";
import { canonicalLink, ogUrl } from "@/lib/seo";

type Search = { code?: string };

export const Route = createFileRoute("/portal")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["code"] === "string" ? { code: search["code"] as string } : {},
  head: () => ({
    meta: [
      { title: "Client portal — Revora Growth Systems" },
      {
        name: "description",
        content:
          "Join your Revora client portal to see your website, leads, bookings, quotes and reports in one place. Create an account, enter your portal code and you're in.",
      },
      { property: "og:title", content: "Client portal — Revora Growth Systems" },
      {
        property: "og:description",
        content:
          "Create your account, enter your portal code and track your website, leads and bookings in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Private client entry point: useful to share directly, never a search result.
      { name: "robots", content: "noindex, follow" },

      ogUrl("/portal"),
    ],
    links: [canonicalLink("/portal")],
  }),
  component: PortalPage,
});

const BENEFITS = [
  {
    icon: Globe,
    title: "Your website",
    body: "See what's live, request changes and track publishes.",
  },
  {
    icon: Users,
    title: "Your leads",
    body: "Every enquiry from your site, with status and follow-up.",
  },
  {
    icon: CalendarCheck,
    title: "Your bookings",
    body: "Appointments and quote requests as they come in.",
  },
  {
    icon: BarChart3,
    title: "Your results",
    body: "Visitors, calls, form fills and monthly reporting.",
  },
];

function PortalPage() {
  const { code: codeParam } = Route.useSearch();
  const navigate = useNavigate();
  const join = useServerFn(joinWithPortalCode);

  const [code, setCode] = React.useState(codeParam ? normalizePortalCode(codeParam) : "");
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [joined, setJoined] = React.useState<string | null>(null);

  const joinCode = React.useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await join({ data: { code: value } });
        if ("error" in result) setError(result.error);
        else {
          window.localStorage.removeItem("revora.portal_code");
          setJoined(result.organizationName ?? "your workspace");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not join that workspace.");
      } finally {
        setBusy(false);
      }
    },
    [join],
  );

  React.useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSignedIn(!!data.session);
      // Signed in and arriving with a code (including after confirming their
      // signup email): finish the join without making them press anything.
      const pending = codeParam ?? window.localStorage.getItem("revora.portal_code") ?? undefined;
      // Consume it immediately so a failed join can never trap them here.
      window.localStorage.removeItem("revora.portal_code");
      if (data.session && pending) {
        const normalized = normalizePortalCode(pending);
        if (normalized.length === PORTAL_CODE_LENGTH) {
          setCode(normalized);
          void joinCode(normalized);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount: it consumes the one-time invite code and
    // re-running on `joinCode`/`codeParam` changes would re-attempt the join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = code.length === PORTAL_CODE_LENGTH;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setError(null);

    // Not signed in yet: create/sign in first, then come straight back here
    // with the code preserved so the join finishes in one motion.
    if (!signedIn) {
      // Survive the email-confirmation round trip.
      window.localStorage.setItem("revora.portal_code", code);
      const next = `/portal?code=${encodeURIComponent(code)}`;
      navigate({ to: "/auth", search: { mode: "signup", redirect: next } });
      return;
    }

    await joinCode(code);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="hero-aura mx-auto max-w-5xl px-4 py-16">
        <p className="eyebrow">Client portal</p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.6rem)] leading-tight font-semibold">
          Your growth system, in one login
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Your website, leads, bookings, quotes, reviews and reporting live in one portal. Create
          your account, enter the portal code your Revora contact gave you, and you're in — no
          waiting on an invite email.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <section className="panel card-lift p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden />
              <h2 className="font-display text-[16px] font-semibold">Join with your portal code</h2>
            </div>

            {joined ? (
              <div className="mt-5">
                <p className="text-[13px]">
                  You're in — welcome to <span className="font-medium">{joined}</span>.
                </p>
                <Button asChild variant="signal" className="mt-4 w-full">
                  <Link to="/my">Open your portal</Link>
                </Button>
              </div>
            ) : (
              <form className="mt-5 space-y-3" onSubmit={submit}>
                <label className="text-[13px] text-muted-foreground" htmlFor="portal-code">
                  Portal code
                </label>
                <Input
                  id="portal-code"
                  value={code}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABCD234XYZ"
                  className="tracking-[0.2em] uppercase"
                  onChange={(event) =>
                    setCode(normalizePortalCode(event.target.value).slice(0, PORTAL_CODE_LENGTH))
                  }
                />
                {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
                <Button type="submit" variant="signal" className="w-full" disabled={!ready || busy}>
                  {busy ? "Joining…" : signedIn ? "Join workspace" : "Create account & join"}
                </Button>
                <p className="text-[13px] text-muted-foreground">
                  {signedIn === false
                    ? "You'll create your account first, then land straight back here to finish joining."
                    : "Codes are 10 characters. Ask your Revora contact if you don't have one."}
                </p>
              </form>
            )}

            <div className="mt-6 border-t border-border pt-4">
              <p className="text-[13px] text-muted-foreground">
                Already have a portal?{" "}
                <Link
                  to="/auth"
                  search={{ mode: "signin", redirect: "/app" }}
                  className="text-primary underline"
                >
                  Sign in
                </Link>
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Not a client yet?{" "}
                <Link to="/pricing" className="text-primary underline">
                  See pricing
                </Link>{" "}
                or{" "}
                <Link to="/get-started" className="text-primary underline">
                  start your 1-day access
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((item) => (
              <div key={item.title} className="panel p-5">
                <item.icon className="size-4 text-primary" aria-hidden />
                <p className="mt-3 font-display text-[14px] font-semibold">{item.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
