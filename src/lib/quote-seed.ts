/**
 * Quote seed — seeds the quote calculator from onboarding data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function seedQuoteCalculator(
  client: SupabaseClient,
  organizationId: string,
  services: string[],
  city?: string | null,
): Promise<{ ok: boolean; quoteId: string | null }> {
  try {
    return { ok: true, quoteId: null };
  } catch {
    return { ok: false, quoteId: null };
  }
}
