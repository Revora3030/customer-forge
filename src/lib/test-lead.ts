/**
 * "Send a test lead" (onboarding): a clearly labeled sample lead the owner
 * sends to their own dashboard to see how a real one will look and alert.
 *
 * Test leads are marked with `source = "test_lead"` (an existing text column,
 * so no schema change) and are left out of every real number: the default
 * leads query, reports, health scores and traffic counts.
 */
export const TEST_LEAD_SOURCE = "test_lead";
export const TEST_LEAD_NAME = "TEST LEAD (sample, not a real customer)";
export const TEST_LEAD_MESSAGE =
  "This is a test lead you sent yourself from your setup checklist. It is not a real customer, nobody was contacted, and it is not counted in your numbers.";

export function isTestLead(lead: { source?: string | null } | null | undefined): boolean {
  return lead?.source === TEST_LEAD_SOURCE;
}
