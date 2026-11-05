import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { unlockPreview } from "@/lib/preview-unlock.functions";

/**
 * Shown instead of a shared preview when its link has a password. It holds no
 * draft data: nothing about the business or the link is on this page.
 */
export function PreviewPasswordGate({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unlockPreview({ data: { token, password } });
      if (result.ok) {
        setPassword("");
        await router.invalidate();
        return;
      }
      setError(
        result.reason === "rate_limited"
          ? "Too many tries. Please wait a few minutes and try again."
          : "That password isn't right.",
      );
    } catch {
      setError("Couldn't check the password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 text-center">
        <h1 className="font-display text-[22px] font-semibold">This preview needs a password</h1>
        <p className="text-[13px] text-muted-foreground">Enter the password you were given to see it.</p>
        <div className="space-y-1.5 text-left">
          <label htmlFor="preview-gate-password" className="text-[13px] font-medium">
            Password
          </label>
          <input
            id="preview-gate-password"
            type="password"
            autoComplete="off"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={200}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "preview-gate-error" : undefined}
            className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-[14px]"
          />
        </div>
        {error ? (
          <p id="preview-gate-error" role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="h-10 w-full rounded-md bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50"
        >
          {busy ? "Checking…" : "See the preview"}
        </button>
      </form>
    </div>
  );
}
