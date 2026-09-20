import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A publish that failed on a passing glitch must never look like a dead end.
 *
 * Toasts disappear, so when going live breaks on something worth retrying this
 * bar stays put until the owner either tries again or dismisses it. It only
 * appears for retryable failures — a refusal (setup unpaid, website not ready)
 * is explained in its own panel instead, because trying again cannot fix it.
 */
export function PublishRetryBar({
  message,
  isRetrying,
  onRetry,
  onDismiss,
}: {
  message: string | null;
  isRetrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl sm:inset-x-6"
    >
      <div className="panel flex flex-wrap items-start gap-3 border-destructive/40 bg-card p-4 shadow-lg">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">Your website didn't go live</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {message} Nothing was lost — everything you built is still saved.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="signal" disabled={isRetrying} onClick={onRetry}>
            <RefreshCw className={`mr-1.5 size-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Trying…" : "Try again"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Dismiss"
            className="size-8"
            onClick={onDismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
