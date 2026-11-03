/**
 * Ordering fence for Stripe subscription events.
 *
 * Stripe delivers webhooks at least once and in any order, and `event.created`
 * is whole seconds, so distinct events can share a timestamp. Three layers keep
 * a late or duplicate event from rewriting the stored subscription:
 *
 * 1. Canceled is terminal per Stripe subscription id: a canceled `sub_X` is
 *    never moved back to a live status (Stripe cannot revive it either; a
 *    resubscribe is a new id). A different subscription ending never replaces
 *    the workspace's current live one.
 * 2. The last applied event's `created` is stored on the row; a strictly older
 *    event is not projected. At the same second, rule 1 decides, so a tie
 *    never moves a canceled subscription back to live.
 * 3. Status-less events (invoices) never write a status themselves; the
 *    webhook re-reads the subscription from Stripe and projects that.
 *
 * Claim-based event idempotency (payment_events) stays in front of all of this.
 */

export type FenceStatus = string;

export type StoredSubscriptionFence = {
  providerSubscriptionId: string | null;
  status: FenceStatus;
  lastEventCreated: number | null;
} | null;

export type IncomingSubscriptionEvent = {
  subscriptionId: string | null;
  /** Mapped Revora status (`canceled`, `active`, ...). */
  status: FenceStatus;
  /** Stripe `event.created` (seconds), when the event carried it. */
  eventCreated: number | null;
};

export type FenceDecision =
  | { apply: true; reason: "first" | "applied"; nextEventCreated: number | null }
  | {
      apply: false;
      reason: "stale_fenced" | "terminal_blocked" | "tie_blocked_resurrection" | "other_subscription_ended";
    };

const CANCELED = "canceled";

const seconds = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;

/** Reads `event.created` defensively; null when absent or malformed. */
export function stripeEventCreated(event: { created?: unknown } | null | undefined): number | null {
  return seconds(event?.created);
}

/** Reads the stored fence column (bigint arrives as number or numeric string). */
export function storedEventCreated(value: unknown): number | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return seconds(Number(value));
  return seconds(value);
}

export function decideSubscriptionProjection(
  stored: StoredSubscriptionFence,
  incoming: IncomingSubscriptionEvent,
): FenceDecision {
  const created = seconds(incoming.eventCreated);
  const fence = stored ? seconds(stored.lastEventCreated) : null;
  const nextEventCreated = created === null ? fence : fence === null ? created : Math.max(fence, created);

  if (!stored || !stored.providerSubscriptionId) return { apply: true, reason: "first", nextEventCreated };

  const sameSubscription = incoming.subscriptionId !== null && stored.providerSubscriptionId === incoming.subscriptionId;
  const incomingCanceled = incoming.status === CANCELED;
  const storedCanceled = stored.status === CANCELED;

  if (sameSubscription) {
    // Layer 2: strictly older than the last applied event.
    if (fence !== null && created !== null && created < fence) return { apply: false, reason: "stale_fenced" };
    // Layer 1: canceled is a one-way door for this subscription id (covers the same-second tie).
    if (storedCanceled && !incomingCanceled) {
      return { apply: false, reason: fence !== null && created === fence ? "tie_blocked_resurrection" : "terminal_blocked" };
    }
    return { apply: true, reason: "applied", nextEventCreated };
  }

  // A different subscription id for the same workspace row.
  if (incomingCanceled && !storedCanceled) return { apply: false, reason: "other_subscription_ended" };
  if (fence !== null && created !== null && created < fence) return { apply: false, reason: "stale_fenced" };
  return { apply: true, reason: "applied", nextEventCreated };
}
