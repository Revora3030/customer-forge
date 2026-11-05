/**
 * Settings "Your account" controls: edit display name, change password,
 * change email, and upload/clear a profile photo. Display name and avatar
 * are written to auth user_metadata (so ensureProfile keeps them on the next
 * sign-in) and to profiles. Password and email changes re-authenticate with
 * the current password first. Email change uses enumeration-safe copy.
 * Account deletion stays mailto elsewhere.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { changePassword } from "@/lib/password-recovery";
import { requestEmailChange, validateChangeEmail } from "@/lib/account-email-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  clearAccountAvatar,
  uploadAccountAvatar,
  validateAvatarFile,
} from "@/lib/account-avatar";
import { humanFileSize } from "@/lib/media";

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
      <p className="text-xs text-muted-foreground">
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


export function ChangeEmailForm({
  email,
  pendingEmail,
}: {
  email: string | null | undefined;
  pendingEmail?: string | null | undefined;
}) {
  const [next, setNext] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [localPending, setLocalPending] = useState<string | null>(null);
  const pending = localPending || pendingEmail || null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateChangeEmail(email, next);
    if (!v.ok) return setStatus({ kind: "error", message: v.message });
    if (!password) return setStatus({ kind: "error", message: "Enter your current password to continue." });
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/app/settings` : "/app/settings";
      const result = await requestEmailChange(supabase.auth, {
        currentEmail: email,
        currentPassword: password,
        newEmail: v.value,
        emailRedirectTo: redirectTo,
      });
      if (!result.ok) return setStatus({ kind: "error", message: result.message });
      setPassword("");
      setNext("");
      if (result.outcome.kind === "sent") {
        if (result.pendingEmail) setLocalPending(result.pendingEmail);
        setStatus({ kind: "ok", message: result.outcome.message });
      } else {
        setStatus({ kind: "error", message: result.outcome.message });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not start the email change. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit} aria-label="Change email">
      {pending ? (
        <p role="status" className="text-[12px] text-muted-foreground">
          Confirmation pending for <span className="font-medium text-foreground">{pending}</span>.
          Check that inbox (and your current one) for the link.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="acct-email-new">New email</Label>
          <Input
            id="acct-email-new"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acct-email-pw">Current password</Label>
          <Input
            id="acct-email-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        We confirm the new address before it becomes your sign-in email. You
        will see the same response whether or not that address can be used.
      </p>
      <Button type="submit" variant="outline" disabled={saving || !email}>
        {saving ? "Sending…" : "Change email"}
      </Button>
      <StatusLine status={status} />
    </form>
  );
}

export function AvatarForm({
  userId,
  initialUrl,
  displayName,
}: {
  userId: string | null | undefined;
  initialUrl: string | null | undefined;
  displayName: string | null | undefined;
}) {
  const [url, setUrl] = useState(initialUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fallback = initials(displayName || "You");

  async function onPick(file: File | null) {
    if (!userId || !file) return;
    const v = validateAvatarFile(file);
    if (!v.ok) return setStatus({ kind: "error", message: v.message });
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const next = await uploadAccountAvatar(userId, v.file);
      setUrl(next);
      setStatus({ kind: "ok", message: "Photo saved." });
    } catch {
      setStatus({ kind: "error", message: "Could not upload your photo. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    if (!userId) return;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      await clearAccountAvatar(userId, url);
      setUrl(null);
      setStatus({ kind: "ok", message: "Photo removed." });
    } catch {
      setStatus({ kind: "error", message: "Could not remove your photo. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" aria-label="Profile photo">
      <Label>Profile photo</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-14">
          {url ? <AvatarImage src={url} alt="" /> : null}
          <AvatarFallback className="text-[13px] font-semibold">{fallback}</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={saving || !userId} asChild>
            <label className="cursor-pointer">
              {saving ? "Working…" : url ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept={AVATAR_ACCEPT}
                className="sr-only"
                disabled={saving || !userId}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onPick(file);
                }}
              />
            </label>
          </Button>
          {url ? (
            <Button type="button" variant="ghost" disabled={saving || !userId} onClick={() => void onClear()}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        JPG, PNG, WebP or AVIF · up to {humanFileSize(AVATAR_MAX_BYTES)}. Shown on your account;
        teammates may see it in the team list.
      </p>
      <StatusLine status={status} />
    </div>
  );
}

