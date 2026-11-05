/**
 * Settings "Your account" controls: edit display name and change password.
 * Display name is written to auth user_metadata.full_name (so ensureProfile
 * keeps it on the next sign-in) and to profiles.full_name. Password change
 * always re-authenticates with the current password first (changePassword).
 * Email change and account deletion are intentionally not here.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { changePassword } from "@/lib/password-recovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const DISPLAY_NAME_MAX = 80;
export const PASSWORD_MIN = 8;

export function validateDisplayName(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, message: "Enter a name." };
  if (value.length > DISPLAY_NAME_MAX)
    return { ok: false, message: `Keep your name under ${DISPLAY_NAME_MAX} characters.` };
  return { ok: true, value };
}

export function validateNewPassword(current: string, next: string, confirm: string): string | null {
  if (!current) return "Enter your current password.";
  if (next.length < PASSWORD_MIN)
    return `Choose a new password of at least ${PASSWORD_MIN} characters.`;
  if (next !== confirm) return "The new passwords don't match.";
  if (next === current) return "Choose a password different from your current one.";
  return null;
}

type Status =
  { kind: "idle" } | { kind: "ok"; message: string } | { kind: "error"; message: string };

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  return (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      className={`text-[12px] ${status.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {status.message}
    </p>
  );
}

export function DisplayNameForm({
  userId,
  initialName,
}: {
  userId: string | null | undefined;
  initialName: string | null | undefined;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const v = validateDisplayName(name);
    if (!v.ok) return setStatus({ kind: "error", message: v.message });
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const { error: metaError } = await supabase.auth.updateUser({ data: { full_name: v.value } });
      if (metaError) throw metaError;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: v.value, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw error;
      setName(v.value);
      setStatus({ kind: "ok", message: "Name saved." });
    } catch {
      setStatus({ kind: "error", message: "Could not save your name. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={onSubmit} aria-label="Display name">
      <Label htmlFor="acct-name">Your name</Label>
      <div className="flex gap-2">
        <Input
          id="acct-name"
          name="full_name"
          value={name}
          maxLength={DISPLAY_NAME_MAX + 20}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={saving || !userId}>
          {saving ? "Saving…" : "Save name"}
        </Button>
      </div>
      <StatusLine status={status} />
    </form>
  );
}

export function ChangePasswordForm({ email }: { email: string | null | undefined }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateNewPassword(current, next, confirm);
    if (problem) return setStatus({ kind: "error", message: problem });
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const result = await changePassword(supabase.auth, {
        recovery: false,
        email,
        currentPassword: current,
        newPassword: next,
      });
      if (!result.ok) return setStatus({ kind: "error", message: result.message });
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ kind: "ok", message: "Password changed. Use it next time you sign in." });
    } catch {
      setStatus({ kind: "error", message: "Could not change your password. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit} aria-label="Change password">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="acct-pw-current">Current password</Label>
          <Input
            id="acct-pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acct-pw-new">New password</Label>
          <Input
            id="acct-pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acct-pw-confirm">Confirm new password</Label>
          <Input
            id="acct-pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Signed in with a magic link or Google and never set a password? Use “Forgot password” on the
        sign-in page instead.
      </p>
      <Button type="submit" variant="outline" disabled={saving}>
        {saving ? "Changing…" : "Change password"}
      </Button>
      <StatusLine status={status} />
    </form>
  );
}
