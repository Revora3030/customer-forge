import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LegalAgreementNote } from "@/components/marketing/LegalAgreementNote";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/ui/notify";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { BrandEmblem, Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorNote, Pill } from "@/components/app/Bits";
import { RouteError } from "@/components/app/RouteStates";
import { SecondFactorPrompt } from "@/components/auth/SecondFactorPrompt";
import { needsSecondFactor } from "@/lib/two-factor";
import { ga4SignUp } from "@/lib/ga4-events";
import { reportRouteError } from "@/lib/route-error-reporting";
import { GROWTH_SYSTEM, REFUND_POLICY, usd } from "@/lib/offer";
import {
  ensureProfile,
  rememberPreference,
  resolvePostLoginPath,
  setRememberPreference,
} from "@/lib/auth-session";
import { authEmailRedirectTo, isSafeRedirect } from "@/lib/prospect-claim";
import {
  emailLinkOutcome,
  NEUTRAL_LINK_TOAST,
  NEUTRAL_MAGIC_LINK_MESSAGE,
  NEUTRAL_RESET_MESSAGE,
  NEUTRAL_SIGNUP_MESSAGE,
  revealsAccountExistence,
} from "@/lib/auth-email-requests";
import { readStarter, STARTER_METADATA_KEY } from "@/components/marketing/hero-starter-utils";

/**
 * Offer recap shown on the signup screen. Every feature line is taken verbatim
 * from `GROWTH_SYSTEM.includes` — the same list the /pricing page renders — so
 * the recap can never claim something pricing doesn't.
 */
const SIGNUP_RECAP_FEATURES: ReadonlyArray<(typeof GROWTH_SYSTEM.includes)[number]> = [
  "Professional business website",
  "Lead capture system",
  "CRM",
  "Online booking",
  "Quote/request system",
  "Automated lead follow-up",
  "Local SEO foundation",
  "Technical support",
];

function starterMetadata(): Record<string, unknown> {
  const starter = readStarter();
  return starter ? { [STARTER_METADATA_KEY]: starter } : {};
}

type Search = { mode?: "signup" | "signin"; redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const rawMode = search["mode"];
    const rawRedirect = search["redirect"];
    const out: Search = {};
    if (rawMode === "signup" || rawMode === "signin") out.mode = rawMode;
    // Same-site paths only: "//evil.com" and "/\\evil.com" start with "/" but
    // send the browser to another site after sign-in.
    // isSafeRedirect adds the control-character and "/x?:" checks used everywhere else.
    if (
      typeof rawRedirect === "string" &&
      rawRedirect.startsWith("/") &&
      !rawRedirect.startsWith("//") &&
      !rawRedirect.includes("\\") &&
      !/^\/[^/]*:/.test(rawRedirect) &&
      isSafeRedirect(rawRedirect)
    )
      out.redirect = rawRedirect;
    return out;
  },
  head: ({ match }) => {
    const label = match.search.mode === "signup" ? "Create your account — Revora" : "Sign in — Revora";
    return {
    links: [{ rel: "preload", as: "image", href: "/revora-mark-144.avif", type: "image/avif" }],
    meta: [
      { title: label },
      {
        name: "description",
        content:
          "Sign in or create your Revora account to manage leads, bookings and your business website.",
      },
      { property: "og:title", content: label },
      { property: "og:description", content: "Access your business command center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    };
  },
  component: AuthPage,
  errorComponent: RouteError,
});

/** LOV-12: true only when this account has a verified authenticator and this session hasn't used it yet. */
async function owesSecondFactor(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return false;
    return needsSecondFactor(data);
  } catch {
    return false;
  }
}

function AuthPage() {
  const { mode, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [magicMode, setMagicMode] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    setRemember(rememberPreference());
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | "reset" | "magic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Persistent (non-toast) notice, e.g. "confirm your email" after signup.
  const [notice, setNotice] = useState<string | null>(null);
  // LOV-12: accounts that turned on an authenticator code finish here first.
  const [codeStep, setCodeStep] = useState(false);

  const goToWorkspace = useCallback(
    async (fallback?: string) => {
      if (redirect && isSafeRedirect(redirect)) {
        // href keeps the query string (e.g. ?claim=<token>); `to` would drop it.
        navigate({ href: redirect, replace: true });
        return;
      }
      const target = fallback ?? (await resolvePostLoginPath());
      navigate({ to: target, replace: true });
    },
    [navigate, redirect],
  );

  useEffect(() => {
    let active = true;
    // Runs only after mount. A failed session/profile check must leave the
    // sign-in form usable instead of escaping as an unhandled rejection.
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active || !data.session) return;
        await ensureProfile(data.session.user);
        if (await owesSecondFactor()) {
          if (active) setCodeStep(true);
          return;
        }
        if (active) await goToWorkspace();
      })
      .catch((error: unknown) => {
        reportRouteError(error, { boundary: "auth_session_check" });
        if (active) setError(error instanceof Error ? error.message : "We couldn't load your account. Please try signing in again.");
      });
    return () => {
      active = false;
    };
  }, [goToWorkspace]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      setRememberPreference(remember);
      if (isSignup) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // The homepage starter rides on the account so /get-started can
            // prefill it even when the email is confirmed on another device.
            data: { full_name: fullName, ...starterMetadata() },
            emailRedirectTo: authEmailRedirectTo(window.location.origin, redirect),
          },
        });
        // "Already registered" must look exactly like a fresh sign-up that
        // is waiting on email confirmation, or this form enumerates accounts.
        const existing = Boolean(signUpError) && revealsAccountExistence(signUpError);
        if (signUpError && !existing) throw signUpError;
        if (!existing) ga4SignUp("email");
        if (existing || !signUpData.session) {
          toast.message("Check your email to continue.");
          setNotice(NEUTRAL_SIGNUP_MESSAGE);
          setPassword("");
          setIsSignup(false);
          return;
        }
        // Save the account details, then send the new client to the exact next
        // step for their workspace (onboarding first, dashboard once ready).
        await ensureProfile(signUpData.session.user);
        toast.success("Welcome to Revora. Let's set up your workspace.");
        await goToWorkspace();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await ensureProfile();
        if (await owesSecondFactor()) {
          setCodeStep(true);
          return;
        }
        toast.success("Welcome back.");
        await goToWorkspace();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError("Enter your email and we'll send a one-tap sign-in link.");
      return;
    }
    setBusy("magic");
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: authEmailRedirectTo(window.location.origin, redirect),
        },
      });
      // Same neutral result whether or not the email has an account.
      const outcome = emailLinkOutcome(otpError, NEUTRAL_MAGIC_LINK_MESSAGE);
      if (outcome.kind === "failed") {
        setError(outcome.message);
        return;
      }
      setMagicSent(true);
      toast.success(NEUTRAL_LINK_TOAST);
    } catch (err) {
      setError(emailLinkOutcome(err, NEUTRAL_MAGIC_LINK_MESSAGE).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleForgotPassword(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!email) {
      setError("Enter the email on your account and we'll send a secure reset link.");
      return;
    }
    setBusy("reset");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      const outcome = emailLinkOutcome(resetError, NEUTRAL_RESET_MESSAGE);
      if (outcome.kind === "failed") {
        setError(outcome.message);
        return;
      }
      setResetSent(true);
      toast.success(NEUTRAL_LINK_TOAST);
    } catch (err) {
      setError(emailLinkOutcome(err, NEUTRAL_RESET_MESSAGE).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle(intent: "continue" | "switch" = "continue") {
    setError(null);
    setBusy("google");
    try {
      setRememberPreference(remember);
      sessionStorage.setItem("lle:redirect", isSafeRedirect(redirect) ? redirect : "/app");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          // Always let the client pick which Google account to use, and force
          // the full consent screen when they explicitly want a different one.
          prompt: intent === "switch" ? "select_account consent" : "select_account",
        },
      });

      if (result.error) {
        setError(result.error.message ?? "Google sign-in failed.");
        return;
      }
      if (result.redirected) return;
      await ensureProfile();
      await goToWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(null);
    }
  }

  if (codeStep) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <SecondFactorPrompt
            onVerified={async () => {
              toast.success("Welcome back.");
              await goToWorkspace();
            }}
            onCancel={async () => {
              await supabase.auth.signOut();
              setCodeStep(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex min-h-11 items-center">
            <Logo />
          </Link>
          <Link
            to="/"
            className="flex min-h-11 items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
        <BrandEmblem className="top-8 right-[-2rem] sm:right-10" />
        <div className="relative w-full max-w-sm">
          {isSignup ? (
            <Pill tone="signal">{`${GROWTH_SYSTEM.fullAccessWindowUpper} FREE — FULL ACCESS`}</Pill>
          ) : null}
          <h1 className="mt-3 font-editorial text-balance text-[24px] leading-tight">
            {isSignup ? (
              <>
                Start your{" "}
                <span className="gold-text">{GROWTH_SYSTEM.fullAccessWindow} free</span>
              </>
            ) : (
              "Welcome back"
            )}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {isSignup ? (
              <>
                Create your account to unlock{" "}
                <span className="gold-hl">
                  every feature free for {GROWTH_SYSTEM.fullAccessWindow}
                </span>
                . No card needed to explore.
              </>
            ) : (
              <>
                Sign in to your business command center — your progress is{" "}
                <span className="gold-hl">saved exactly where you left off</span>.
              </>
            )}
          </p>

          {isSignup ? (
            <ol className="mt-5 space-y-2 text-[12.5px] text-muted-foreground">
              {[
                "Create your account",
                "Answer a few questions about your business",
                `Explore the full system free for ${GROWTH_SYSTEM.fullAccessWindow}`,
                `Launch when ready — ${usd(GROWTH_SYSTEM.setupPrice)} setup, first month free`,
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className={index === 0 ? "text-foreground" : undefined}>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {isSignup ? (
            <section
              aria-labelledby="signup-offer-recap"
              className="mt-5 rounded-md border border-primary/30 bg-primary/5 px-4 py-3.5"
            >
              <h2
                id="signup-offer-recap"
                className="text-xs font-semibold tracking-wider text-primary uppercase"
              >
                Your plan when you launch
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
                <span className="tnum font-semibold">{usd(GROWTH_SYSTEM.setupPrice)}</span> setup,
                your first month free, then{" "}
                <span className="tnum font-semibold">{usd(GROWTH_SYSTEM.monthlyPrice)}/month</span>.
                Cancel anytime.
              </p>
              <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                {SIGNUP_RECAP_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className="mt-[0.45em] size-1 shrink-0 rounded-full bg-primary"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-xs text-muted-foreground">
                <Link to="/pricing" className="text-primary underline-offset-4 hover:underline">
                  See full pricing
                </Link>
              </p>
            </section>
          ) : null}

          {forgotMode ? (
            <div className="panel mt-6 p-5">
              <h2 className="font-display text-[17px] font-semibold text-foreground">
                Reset your password
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Enter your account email. We'll send a secure, single-use link that expires shortly
                — open it on this device to choose a new password.
              </p>
              <form className="mt-4 space-y-4" onSubmit={handleForgotPassword}>
                <div className="space-y-1.5">
                  <Label htmlFor="fp-email">Email</Label>
                  <Input
                    id="fp-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setResetSent(false);
                    }}
                    autoComplete="email"
                    required
                  />
                </div>
                {error ? <ErrorNote message={error} /> : null}
                {resetSent ? (
                  <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-center text-[12.5px] text-foreground">
                    {NEUTRAL_RESET_MESSAGE}
                  </p>
                ) : null}
                <Button type="submit" variant="signal" className="w-full" disabled={busy !== null}>
                  {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : null}
                  {resetSent ? "Send another link" : "Email me a reset link"}
                </Button>
                <button
                  type="button"
                  className="min-h-11 w-full cursor-pointer text-center text-[12.5px] text-muted-foreground transition-colors hover:text-primary"
                  onClick={() => {
                    setForgotMode(false);
                    setResetSent(false);
                    setError(null);
                  }}
                  disabled={busy !== null}
                >
                  Back to sign in
                </button>
              </form>
            </div>
          ) : (
            <div className="panel mt-6 p-5">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleGoogle("continue")}
                disabled={busy !== null}
              >
                {busy === "google" ? <Loader2 className="size-4 animate-spin" /> : null}
                Continue with Google
              </Button>
              <button
                type="button"
                onClick={() => void handleGoogle("switch")}
                disabled={busy !== null}
                className="mt-2 min-h-11 w-full cursor-pointer rounded-md py-2 text-[13px] text-primary underline-offset-4 transition-colors hover:underline disabled:opacity-60"
              >
                Use a different Google account
              </button>
              <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
                Each Google account gets its own <span className="gold-hl">Revora</span> workspace.
              </p>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs tracking-wider uppercase text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form
                className="space-y-4"
                onSubmit={magicMode && !isSignup ? handleMagicLink : handleEmail}
              >
                {isSignup ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="a-name">Your name</Label>
                    <Input
                      id="a-name"
                      name="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="a-email">Email</Label>
                  <Input
                    id="a-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setMagicSent(false);
                    }}
                    autoComplete="email"
                    required
                  />
                </div>
                {magicMode && !isSignup ? null : (
                  <div className="space-y-1.5">
                    <Label htmlFor="a-password">Password</Label>
                    <Input
                      id="a-password"
                      name="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      minLength={8}
                      required
                    />
                  </div>
                )}
                {magicMode && !isSignup ? null : (
                  <label
                    htmlFor="a-remember"
                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-elevated/60 px-3 py-2.5"
                  >
                    <Checkbox
                      id="a-remember"
                      checked={remember}
                      onCheckedChange={(v) => {
                        const next = v === true;
                        setRemember(next);
                        setRememberPreference(next);
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-[12.5px] leading-snug">
                      <span className="font-medium text-foreground">Remember me</span>
                      <span className="block text-muted-foreground">
                        {remember
                          ? "Stay signed in on this device across refreshes — sign out any time."
                          : "You'll be signed out when you close this browser."}
                      </span>
                    </span>
                  </label>
                )}
                {error ? <ErrorNote message={error} /> : null}
                {notice ? (
                  <p
                    role="status"
                    className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-center text-[12.5px] text-foreground"
                  >
                    {notice}
                  </p>
                ) : null}
                {magicSent && magicMode && !isSignup ? (
                  <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-center text-[12.5px] text-foreground">
                    {NEUTRAL_MAGIC_LINK_MESSAGE}
                  </p>
                ) : null}
                <Button type="submit" variant="signal" className="w-full" disabled={busy !== null}>
                  {busy === "email" || busy === "magic" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {isSignup
                    ? "CREATE ACCOUNT — START FREE"
                    : magicMode
                      ? magicSent
                        ? "Resend sign-in link"
                        : "Email me a sign-in link"
                      : "Sign in"}
                </Button>
                {isSignup ? <LegalAgreementNote action="creating an account" /> : null}
                {!isSignup ? (
                  <>
                    <button
                      type="button"
                      className="min-h-11 w-full cursor-pointer text-center text-[12.5px] text-primary transition-colors hover:underline"
                      onClick={() => {
                        setError(null);
                        setMagicSent(false);
                        setMagicMode((v) => !v);
                      }}
                      disabled={busy !== null}
                    >
                      {magicMode
                        ? "Use my password instead"
                        : "Sign in without a password — email me a magic link"}
                    </button>
                    {magicMode ? null : (
                      <button
                        type="button"
                        className="min-h-11 w-full cursor-pointer text-center text-[12.5px] text-muted-foreground transition-colors hover:text-primary"
                        onClick={() => {
                          setError(null);
                          setResetSent(false);
                          setForgotMode(true);
                        }}
                        disabled={busy !== null}
                      >
                        Forgot your password?
                      </button>
                    )}
                  </>
                ) : null}
                <p className="text-center text-xs text-muted-foreground">
                  {remember
                    ? "We keep you signed in on this device, so next time you land straight in your dashboard."
                    : "This session ends when you close your browser."}
                </p>
              </form>
            </div>
          )}

          <p className="mt-5 text-center text-[13px] text-muted-foreground">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 justify-center px-1 cursor-pointer items-center text-primary hover:underline"
              onClick={() => {
                setError(null);
                setIsSignup((v) => !v);
              }}
            >
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
