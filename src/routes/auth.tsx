import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/ui/notify";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorNote, Pill } from "@/components/app/Bits";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import {
  ensureProfile,
  rememberPreference,
  resolvePostLoginPath,
  setRememberPreference,
} from "@/lib/auth-session";

type Search = { mode?: "signup" | "signin"; redirect?: string };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): Search => {
    const rawMode = search["mode"];
    const rawRedirect = search["redirect"];
    const out: Search = {};
    if (rawMode === "signup" || rawMode === "signin") out.mode = rawMode;
    if (typeof rawRedirect === "string" && rawRedirect.startsWith("/")) out.redirect = rawRedirect;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Sign in — Revora" },
      {
        name: "description",
        content:
          "Sign in or create your Revora account to manage leads, bookings and your business website.",
      },
      { property: "og:title", content: "Sign in — Revora" },
      { property: "og:description", content: "Access your business command center." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [magicMode, setMagicMode] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [remember, setRemember] = useState(rememberPreference());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | "reset" | "magic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Persistent (non-toast) notice, e.g. "confirm your email" after signup.
  const [notice, setNotice] = useState<string | null>(null);

  const goToWorkspace = useCallback(
    async (fallback?: string) => {
      if (redirect) {
        navigate({ to: redirect, replace: true });
        return;
      }
      const target = fallback ?? (await resolvePostLoginPath());
      navigate({ to: target, replace: true });
    },
    [navigate, redirect],
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      await ensureProfile(data.session.user);
      if (active) void goToWorkspace();
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
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}${redirect ?? "/app"}`,
          },
        });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          const message = `Account created for ${email}. Confirm your email address using the link we just sent, then sign in here — your progress is saved.`;
          toast.success("Account created. Check your email to confirm, then sign in.");
          setNotice(message);
          setPassword("");
          setIsSignup(false);
          return;
        }
        // Save the account details, then send the new client to the exact next
        // step for their workspace (onboarding first, dashboard once ready).
        await ensureProfile();
        toast.success("Welcome to Revora. Let's set up your workspace.");
        await goToWorkspace();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await ensureProfile();
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
          emailRedirectTo: `${window.location.origin}/auth${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`,
        },
      });
      if (otpError) throw otpError;
      setMagicSent(true);
      toast.success("Sign-in link sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the sign-in link.");
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
      if (resetError) throw resetError;
      setResetSent(true);
      toast.success("Reset link sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle(intent: "continue" | "switch" = "continue") {
    setError(null);
    setBusy("google");
    try {
      setRememberPreference(remember);
      sessionStorage.setItem("lle:redirect", redirect ?? "/app");
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/">
            <Logo />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {isSignup ? (
            <Pill tone="signal">{`${GROWTH_SYSTEM.fullAccessWindowUpper} FREE — FULL ACCESS`}</Pill>
          ) : null}
          <h1 className="mt-3 font-display text-[24px] leading-tight font-semibold">
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
                  <span className="tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-[10px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className={index === 0 ? "text-foreground" : undefined}>{step}</span>
                </li>
              ))}
            </ol>
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
                    Reset link sent to <span className="gold-hl">{email}</span>. It works once and
                    expires — if it's gone stale, request a fresh one.
                  </p>
                ) : null}
                <Button type="submit" variant="signal" className="w-full" disabled={busy !== null}>
                  {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : null}
                  {resetSent ? "Send another link" : "Email me a reset link"}
                </Button>
                <button
                  type="button"
                  className="w-full cursor-pointer text-center text-[12.5px] text-muted-foreground transition-colors hover:text-primary"
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
                {isSignup ? "Sign up with Google" : "Continue with Google"}
              </Button>
              <button
                type="button"
                onClick={() => void handleGoogle("switch")}
                disabled={busy !== null}
                className="mt-2 w-full cursor-pointer rounded-md py-2 text-[13px] text-primary underline-offset-4 transition-colors hover:underline disabled:opacity-60"
              >
                Use a different Google account
              </button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Each Google account gets its own <span className="gold-hl">Revora</span> workspace.
              </p>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] tracking-wider uppercase text-muted-foreground">
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
                    Link sent to <span className="gold-hl">{email}</span>. Open it on this device
                    and you'll land straight in your dashboard.
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
                {!isSignup ? (
                  <>
                    <button
                      type="button"
                      className="w-full cursor-pointer text-center text-[12.5px] text-primary transition-colors hover:underline"
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
                        className="w-full cursor-pointer text-center text-[12.5px] text-muted-foreground transition-colors hover:text-primary"
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
                <p className="text-center text-[11.5px] text-muted-foreground">
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
              className="cursor-pointer text-primary hover:underline"
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
