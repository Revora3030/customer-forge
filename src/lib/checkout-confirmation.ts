/** Bounded read-only payment reconciliation; never grants an entitlement. */
export const CONFIRMATION_INTERVAL_MS = 3000;
export const CONFIRMATION_TIMEOUT_MS = 120000;

export function startConfirmationPolling(refresh: () => void, onTimeout: () => void) {
  refresh();
  const interval = setInterval(refresh, CONFIRMATION_INTERVAL_MS);
  const timeout = setTimeout(() => {
    clearInterval(interval);
    onTimeout();
  }, CONFIRMATION_TIMEOUT_MS);
  return () => {
    clearInterval(interval);
    clearTimeout(timeout);
  };
}