/**
 * LOV-12: optional authenticator-app sign-in code for the signed-in person.
 * Uses the auth provider's free built-in TOTP MFA. Never forced. Until the
 * project setting is switched on, this shows "Coming soon" instead of an error.
 */
import * as React from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/ui/notify";
import {
  cleanCode,
  isCompleteCode,
  isTwoFactorUnavailable,
  unverifiedTotpFactors,
  verifiedTotpFactors,
} from "@/lib/two-factor";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "off" }
  | { kind: "enrolling"; factorId: string; qr: string; secret: string }
  | { kind: "on"; factorId: string };

export function TwoFactorCard() {
  const [state, setState] = React.useState<State>({ kind: "loading" });
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setState(isTwoFactorUnavailable(listError) ? { kind: "unavailable" } : { kind: "off" });
      return;
    }
    const factor = verifiedTotpFactors(data?.all)[0];
    setState(factor ? { kind: "on", factorId: factor.id } : { kind: "off" });
  }, []);

  React.useEffect(() => {
    void refresh().catch(() => setState({ kind: "off" }));
  }, [refresh]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      // A closed tab mid-setup leaves an unverified factor that blocks a new one.
      const { data: listed } = await supabase.auth.mfa.listFactors();
      for (const stale of unverifiedTotpFactors(listed?.all)) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Revora ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError) {
        if (isTwoFactorUnavailable(enrollError)) {
          setState({ kind: "unavailable" });
          return;
        }
        throw enrollError;
      }
      setCode("");
      setState({ kind: "enrolling", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start set-up. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "enrolling") return;
    if (!isCompleteCode(code)) {
      setError("Enter the 6-digit code your app shows.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: state.factorId,
        code,
      });
      if (verifyError) throw new Error("That code didn't match. Check the app and try again.");
      toast.success("Sign-in code turned on.");
      setState({ kind: "on", factorId: state.factorId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  async function cancelSetup() {
    if (state.kind !== "enrolling") return;
    await supabase.auth.mfa.unenroll({ factorId: state.factorId }).catch(() => undefined);
    setError(null);
    setState({ kind: "off" });
  }

  async function turnOff() {
    if (state.kind !== "on") return;
    if (typeof window !== "undefined" && !window.confirm("Turn off the sign-in code? Your password alone will sign you in.")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: state.factorId });
      if (unenrollError) throw unenrollError;
      toast.success("Sign-in code turned off.");
      setState({ kind: "off" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn it off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const pill =
    state.kind === "on" ? (
      <Pill tone="signal" dot>
        On
      </Pill>
    ) : state.kind === "unavailable" ? (
      <Pill>Coming soon</Pill>
    ) : state.kind === "loading" ? null : (
      <Pill>Off</Pill>
    );

  return (
    <Panel data-testid="two-factor-card">
      <SectionHeading
        eyebrow="Your sign-in"
        title="Authenticator app code"
        description="Optional. After your password, also ask for a 6-digit code from an app like Google Authenticator, Microsoft Authenticator or 1Password."
        action={pill}
      />
      <div className="mt-4 space-y-3 text-[13px]">
        {state.kind === "loading" ? (
          <p className="text-muted-foreground">Checking…</p>
        ) : state.kind === "unavailable" ? (
          <p className="text-muted-foreground">
            Coming soon. Your account works as normal with your password in the meantime.
          </p>
        ) : state.kind === "off" ? (
          <Button onClick={() => void start()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            Turn on sign-in code
          </Button>
        ) : state.kind === "enrolling" ? (
          <form onSubmit={confirm} className="space-y-3">
            <p>1. Scan this with your authenticator app.</p>
            <img src={state.qr} alt="QR code to add Revora to your authenticator app" className="h-44 w-44 rounded bg-white p-2" />
            <p className="text-muted-foreground">
              Can't scan? Enter this key instead: <code className="break-all">{state.secret}</code>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="two-factor-setup-code">2. Type the 6-digit code it shows</Label>
              <Input
                id="two-factor-setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                placeholder="123456"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Confirm and turn on
              </Button>
              <Button type="button" variant="ghost" onClick={() => void cancelSetup()}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Each new sign-in asks for a code from your app. Keep the app on a phone you have with
              you.
            </p>
            <Button variant="outline" onClick={() => void turnOff()} disabled={busy}>
              <ShieldOff className="h-4 w-4" aria-hidden />
              Turn off
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
