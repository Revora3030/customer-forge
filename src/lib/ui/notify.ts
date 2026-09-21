import { toast as sonner } from "sonner";

/**
 * One message vocabulary for the whole product.
 *
 * Every confirmation, warning and failure goes through here so wording,
 * timing and tone are identical on every page. Sonner is never imported
 * directly by feature code.
 */

/** How long each kind of message stays on screen (ms). */
export const NOTIFY_DURATION = {
  done: 3200,
  info: 4000,
  warn: 6000,
  fail: 7000,
  working: Number.POSITIVE_INFINITY,
} as const;

type Id = string | number;
type Extra = { description?: string; id?: Id };

/** A change the person asked for succeeded. */
function done(message: string, extra?: Extra): Id {
  return sonner.success(message, { duration: NOTIFY_DURATION.done, ...extra });
}

/** Neutral information — no action needed. */
function info(message: string, extra?: Extra): Id {
  return sonner(message, { duration: NOTIFY_DURATION.info, ...extra });
}

/** Something needs attention but nothing broke. */
function warn(message: string, extra?: Extra): Id {
  return sonner.warning(message, { duration: NOTIFY_DURATION.warn, ...extra });
}

/** Something failed. Always say what to do next in `description` when known. */
function fail(message: string, extra?: Extra): Id {
  return sonner.error(message, { duration: NOTIFY_DURATION.fail, ...extra });
}

/** Long-running work. Keep the returned id and pass it to done/fail. */
function working(message: string, extra?: Extra): Id {
  return sonner.loading(message, { duration: NOTIFY_DURATION.working, ...extra });
}

function dismiss(id?: Id): void {
  sonner.dismiss(id);
}

export const notify = { done, info, warn, fail, working, dismiss };

/**
 * Compatibility surface for existing call sites: same shape as sonner's
 * `toast`, but every kind carries the shared duration above.
 */
type Opts = Record<string, unknown>;
type ToastFn = ((message: string, opts?: Opts) => Id) & {
  success: (message: string, opts?: Opts) => Id;
  error: (message: string, opts?: Opts) => Id;
  warning: (message: string, opts?: Opts) => Id;
  info: (message: string, opts?: Opts) => Id;
  loading: (message: string, opts?: Opts) => Id;
  message: (message: string, opts?: Opts) => Id;
  dismiss: (id?: Id) => void;
};

const base = ((message: string, opts?: Opts) =>
  sonner(message, { duration: NOTIFY_DURATION.info, ...opts })) as ToastFn;

base.success = (message, opts) =>
  sonner.success(message, { duration: NOTIFY_DURATION.done, ...opts });
base.error = (message, opts) => sonner.error(message, { duration: NOTIFY_DURATION.fail, ...opts });
base.warning = (message, opts) =>
  sonner.warning(message, { duration: NOTIFY_DURATION.warn, ...opts });
base.info = (message, opts) => sonner.info(message, { duration: NOTIFY_DURATION.info, ...opts });
base.loading = (message, opts) =>
  sonner.loading(message, { duration: NOTIFY_DURATION.working, ...opts });
base.message = (message, opts) => sonner(message, { duration: NOTIFY_DURATION.info, ...opts });
base.dismiss = (id) => sonner.dismiss(id);

export const toast = base;
