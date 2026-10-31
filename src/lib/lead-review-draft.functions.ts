import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateLeadReviewDraftInput } from "@/lib/lead-review-draft.server";

/**
 * Prepares (never sends or saves) a review-request draft for a completed lead
 * that has no booking. The browser names the workspace and the lead; the
 * wording and the consent decision are made on the server.
 */
export const getLeadReviewDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateLeadReviewDraftInput)
  .handler(async ({ data, context }) => {
    const [{ buildLeadReviewDraft }, { supabaseAdmin }, outreach, { automationConsentLookups }] = await Promise.all([
      import("@/lib/lead-review-draft.server"),
      import("@/integrations/supabase/client.server"),
      import("@/lib/prospect-outreach.server"),
      import("@/lib/messaging.server"),
    ]);
    return buildLeadReviewDraft(context.supabase, context.userId, data, {
      // Read-only consent lists, read with the service role by exact value.
      lookups: (state) => automationConsentLookups(supabaseAdmin as never, outreach, state),
    });
  });
