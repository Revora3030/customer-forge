import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateReviewReplyInput } from "@/lib/review-reply-draft";

/**
 * Drafts (never posts, sends or saves) replies to one review, only when the
 * owner asks. The owner copies a draft into Google themselves.
 */
export const getReviewReplyDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateReviewReplyInput)
  .handler(async ({ data, context }) => {
    const [{ buildReviewReplyDrafts }, { generateText }] = await Promise.all([
      import("@/lib/review-reply-draft.server"),
      import("@/lib/ai/router.server"),
    ]);
    return buildReviewReplyDrafts(context.supabase, context.userId, data, {
      generate: async (caller, request) => {
        const result = await generateText(caller, request);
        return { text: result.text, model: result.model };
      },
    });
  });
