import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Registers the owner dashboard service worker (scope /app/) and shows a small
 * "new version ready" prompt. Client only: the effect never runs during SSR,
 * and the virtual module is imported lazily so the server bundle never loads it.
 */
export function OwnerPwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (cancelled) return;
        updateRef.current = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
          onRegisterError: (error: unknown) =>
            console.warn("[pwa] service worker registration failed", error),
        });
      })
      .catch((error: unknown) => console.warn("[pwa] service worker unavailable", error));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#0A0A0C]/95 p-3 text-sm text-zinc-100 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4"
    >
      <RefreshCw className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
      <span className="flex-1">A new version of your dashboard is ready.</span>
      <Button size="sm" onClick={() => void updateRef.current?.(true)}>
        Reload
      </Button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        className="inline-flex size-11 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100"
        onClick={() => setNeedRefresh(false)}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
