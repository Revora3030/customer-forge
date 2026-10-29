/** Signature verification and claim ownership are handled by the caller. */
export async function finishClaimedWebhook(operations: {
  process: () => Promise<void>;
  settle: () => Promise<void>;
  release: () => Promise<void>;
}): Promise<void> {
  try {
    await operations.process();
    await operations.settle();
  } catch (failure) {
    // Never acknowledge work whose handler or bookkeeping failed. Only the
    // caller's own unprocessed claim may be released; no stale takeover.
    try {
      await operations.release();
    } catch {
      throw new Error("Webhook failed and its unfinished claim could not be released; operator review is required.");
    }
    throw failure;
  }
}

/** An existing claim alone is NOT evidence that its work completed. */
export function completedWebhookDuplicate(row: { processed?: boolean } | null, readError: unknown): boolean {
  return !readError && row?.processed === true;
}