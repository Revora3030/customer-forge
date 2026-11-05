/**
 * LOV-12: the 6-digit authenticator code step shown after a password, link or
 * Google sign-in, only for accounts that turned the code on.
 */
import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cleanCode, isCompleteCode, verifiedTotpFactors } from "@/lib/two-factor";

export function SecondFactorPrompt({
  onVerified,
  onCancel,
}: {
  onVerified: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isCompleteCode(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const factor = verifiedTotpFactors(data?.all)[0];
      if (!factor) throw new Error("No authenticator is set up on this account.");
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (verifyError) throw new Error("That code didn't match. Check the app and try again.");
      await onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="second-factor-prompt">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        <div>
          <p className="text-[15px] font-semibold">Enter your sign-in code</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Open your authenticator app and type the 6-digit code for Revora.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="two-factor-code">6-digit code</Label>
        <Input
          id="two-factor-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          placeholder="123456"
        />
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Verify and continue
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => void onCancel()}>
        Sign out and use a different account
      </Button>
      <p className="text-[12px] text-muted-foreground">
        Lost your phone? Email support from the address on your account and we'll verify you and
        remove the code so you can sign in.
      </p>
    </form>
  );
}
