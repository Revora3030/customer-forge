import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui/notify";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/app/Bits";
import { resolvePostLoginPath, setRememberPreference } from "@/lib/auth-session";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Revora" },
      { name: "description", content: "Choose a new password for your Revora account." },
      { property: "og:title", content: "Set a new password — Revora" },
      { property: "og:description", content: "Choose a new password for your Revora account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts recovery failures (expired / already-used links) in the URL
    // hash, so surface them instead of showing an unusable form.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashError = hash.get("error_description") ?? hash.get("error");
    if (hashError) setLinkError(hashError.replace(/\+/g, " "));

    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setReady(true);
        setLinkError(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setRememberPreference(true);
      toast.success("Password updated. You're signed in.");
      navigate({ to: await resolvePostLoginPath(), replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setBusy(false);
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
            to="/auth"
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to sign in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-[24px] leading-tight font-semibold">
            Set a <span className="gold-text">new password</span>
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {linkError
              ? "That reset link is no longer valid — links are single-use and expire quickly."
              : ready
                ? "Choose a password of at least 8 characters. We'll keep you signed in on this device."
                : "Open the reset link from your email on this device to continue."}
          </p>

          {linkError ? (
            <div className="panel mt-6 space-y-3 p-5">
              <ErrorNote message={linkError} />
              <Link
                to="/auth"
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form className="panel mt-6 space-y-4 p-5" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="rp-password">New password</Label>
                <Input
                  id="rp-password"
                  name="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-confirm">Confirm password</Label>
                <Input
                  id="rp-confirm"
                  name="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              {error ? <ErrorNote message={error} /> : null}
              <Button type="submit" variant="signal" className="w-full" disabled={busy || !ready}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Update password
              </Button>
              {ready ? null : (
                <p className="text-center text-[11.5px] text-muted-foreground">
                  Waiting for your reset link — open it in this browser to unlock this form.
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
