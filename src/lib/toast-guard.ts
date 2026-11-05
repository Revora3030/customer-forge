import { toast } from "sonner";
import { userSafeMessage } from "@/lib/user-error";

let installed = false;

/**
 * Wraps `toast.error` once so a raw runtime/database error ("TypeError: Cannot
 * read properties of undefined", a Postgres constraint message, "Failed to
 * fetch") can never reach a person's screen, whichever call site produced it.
 * Our own written messages pass through untouched; the original text is still
 * logged to the console for debugging.
 */
export function installToastGuard(): void {
  if (installed) return;
  installed = true;
  const original = toast.error.bind(toast);
  const guarded: typeof toast.error = (message, data) => {
    if (typeof message === "string") {
      const safe = userSafeMessage(message);
      if (safe !== message) {
        console.warn("[toast] hid a raw error message:", message);
        return original(safe, data);
      }
    }
    return original(message, data);
  };
  toast.error = guarded;
}
