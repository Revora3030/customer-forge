import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateLeadReplyDraftInput } from "@/lib/lead-reply-draft.server";

/**
 * Drafts (never sends or saves) a first reply to one lead, only when the owner
 * asks from the lead card. One short Lovable AI call under the shared caps.
 */
export const getLeadReplyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateLeadReplyDraftInput)
  .handler(async ({ data, context }) => {
    const [{ buildLeadReplyDraft }, { generateText }] = await Promise.all([
      import("@/lib/lead-reply-draft.server"),
      import("@/lib/ai/router.server"),
    ]);
    return buildLeadReplyDraft(context.supabase, context.userId, data, {
      generate: async (caller, request) => {
        const result = await generateText(caller, request);
        return { text: result.text, model: result.model };
      },
    });
  });
