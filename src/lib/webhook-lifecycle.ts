/** Signature verification and claim ownership are handled by the caller. */
export async function finishClaimedWebhook(operations: {
  process: () => Promise<void>;
  settle: () => Promise<void>;
}): Promise<void> {
  try {
    await operations.process();
    await operations.settle();
  } catch (failure) {
    // A failure may follow partial side effects. Retain the claim rather than
    // authorizing automatic replay; unfinished duplicates require review.
    throw failure;
  }
}

/** An existing claim alone is NOT evidence that its work completed. */
export function completedWebhookDuplicate(row: {
  processed?: boolean; verification_status?: string; organization_id?: string | null;
  event_type?: string; resource_id?: string; payload?: unknown;
} | null, readError: unknown, expected: {
  organizationId: string | null; eventType: string; resourceId: string; environment: string;
}): boolean {
  const payload = row?.payload as { environment?: unknown } | null;
  return !readError && row?.processed === true && row.verification_status === "verified" &&
    row.organization_id === expected.organizationId && row.event_type === expected.eventType &&
    row.resource_id === expected.resourceId && payload?.environment === expected.environment;
}