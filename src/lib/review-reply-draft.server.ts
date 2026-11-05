/**
 * Server side of COMP-11. Runs only when the owner asks; one short AI call
 * through the shared router (so Luna's cap and the daily paid reservation
 * apply). Returns wording only: nothing is saved, sent or posted anywhere.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AiCaller, AiRequest } from "@/lib/ai/types";
import { requireOrgRole } from "@/lib/org-authz.server";
import {
  DONT_ARGUE_GUIDANCE,
  parseReviewDrafts,
  reviewReplyMessages,
  reviewSentiment,
  type ReviewReplyDrafts,
  type ReviewReplyInput,
} from "@/lib/review-reply-draft";

type Db = SupabaseClient<Database>;
export const REVIEW_REPLY_MODEL = "google/gemini-2.5-flash";

export type ReviewReplyDeps = {
  generate: (caller: AiCaller, request: AiRequest) => Promise<{ text: string; model: string }>;
};

export async function buildReviewReplyDrafts(userDb: Db, userId: string, input: ReviewReplyInput, deps: ReviewReplyDeps): Promise<ReviewReplyDrafts> {
  const organizationId = await requireOrgRole(userDb, input.organizationId, userId, "staff");
  let review = { text: input.text, rating: input.rating, authorName: input.authorName };
  if (input.reviewId) {
    const { data, error } = await userDb
      .from("reviews")
      .select("id, author_name, rating, comment")
      .eq("id", input.reviewId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load that review. Try again.");
    if (!data) throw new Error("Review not found");
    if (!data.comment?.trim()) throw new Error("That review has stars but no words, so there is nothing specific to reply to.");
    review = { text: data.comment, rating: data.rating ?? null, authorName: data.author_name ?? "" };
  }
  const { data: org } = await userDb.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const sentiment = reviewSentiment(review.rating, review.text);
  const result = await deps.generate(
    { organizationId, userId, task: "review.reply-draft" },
    {
      role: "fast",
      preferModels: [REVIEW_REPLY_MODEL],
      maxOutputTokens: 500,
      temperature: 0.6,
      messages: reviewReplyMessages(org?.name?.trim() ?? "", review, input.tone, sentiment),
    },
  );
  const drafts = parseReviewDrafts(result.text);
  if (drafts.length < 2) throw new Error("The drafts didn't come back usable. Try again.");
  return { drafts, sentiment, guidance: sentiment === "positive" ? [] : DONT_ARGUE_GUIDANCE, model: result.model };
}
