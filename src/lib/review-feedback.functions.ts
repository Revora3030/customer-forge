import { createServerFn } from "@tanstack/react-start";
import type { FeedbackView } from "@/lib/review-feedback.server";

/**
 * Public, read-only: the customer's /feedback/<token> page. The token is an
 * unguessable 24-byte value from the review email; no tenant id is accepted.
 */
export const getReviewFeedback = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => ({ token: String(input?.token ?? "").slice(0, 64) }))
  .handler(async ({ data }): Promise<FeedbackView | null> => {
    const [{ supabaseAdmin }, { loadFeedbackView }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/review-feedback.server"),
    ]);
    try {
      return await loadFeedbackView(supabaseAdmin, data.token);
    } catch (error) {
      console.error("[review-feedback]", error instanceof Error ? error.message : "unknown");
      return null;
    }
  });
