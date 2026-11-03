/**
 * The customer side of the post-job review sequence (review-sequence.ts):
 * /feedback/<token> reads the request and records the star rating and any
 * private note. Service-role client only; the token is the only thing the
 * customer supplies, so nothing here accepts an organization or record id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { skipQueuedReviewRuns } from "@/lib/automation-queue.server";
import { cleanFeedback, isFeedbackToken, routeForRating, safeReviewUrl } from "@/lib/review-sequence";

type Db = SupabaseClient<Database>;

export type FeedbackView = {
  businessName: string;
  firstName: string;
  rating: number | null;
  routedTo: "google" | "private" | null;
  feedbackSent: boolean;
  /** The public review page. Offered for EVERY rating (Google forbids review gating). */
  reviewUrl: string | null;
};

type RequestRow = {
  id: string;
  organization_id: string;
  appointment_id: string | null;
  customer_name: string;
  rating: number | null;
  routed_to: string | null;
  feedback: string | null;
};

async function loadRow(admin: Db, token: string): Promise<RequestRow | null> {
  if (!isFeedbackToken(token)) return null;
  const { data, error } = await admin
    .from("review_feedback_requests")
    .select("id, organization_id, appointment_id, customer_name, rating, routed_to, feedback")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the feedback request: ${error.message}`);
  return (data as RequestRow | null) ?? null;
}

async function businessFor(admin: Db, organizationId: string) {
  const [{ data: org }, { data: profile }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    admin.from("business_profiles").select("review_link").eq("organization_id", organizationId).maybeSingle(),
  ]);
  return {
    businessName: (org?.name as string | undefined)?.trim() || "our team",
    reviewUrl: safeReviewUrl(profile?.review_link as string | null | undefined),
  };
}

function view(row: RequestRow, business: { businessName: string; reviewUrl: string | null }): FeedbackView {
  return {
    businessName: business.businessName,
    firstName: row.customer_name.trim().split(/\s+/)[0] || "there",
    rating: row.rating,
    routedTo: row.routed_to === "google" || row.routed_to === "private" ? row.routed_to : null,
    feedbackSent: Boolean(row.feedback),
    reviewUrl: business.reviewUrl,
  };
}

/** Read-only: opening the link (or an inbox scanner prefetching it) changes nothing. */
export async function loadFeedbackView(admin: Db, token: string): Promise<FeedbackView | null> {
  const row = await loadRow(admin, token);
  if (!row) return null;
  return view(row, await businessFor(admin, row.organization_id));
}

/**
 * Records the first star rating for this job (later taps don't change it) and
 * stops the day-3 reminder. 1–3 stars tell the owner in-app; the customer is
 * then asked for a private note.
 */
export async function recordFeedbackRating(admin: Db, token: string, rating: number): Promise<FeedbackView | null> {
  const row = await loadRow(admin, token);
  if (!row) return null;
  const business = await businessFor(admin, row.organization_id);
  if (row.rating != null) return view(row, business);

  const routedTo = routeForRating(rating);
  const { data: updated, error } = await admin
    .from("review_feedback_requests")
    .update({ rating, routed_to: routedTo, rated_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("rating", null)
    .select("id");
  if (error) throw new Error(`Couldn't save the rating: ${error.message}`);
  // Lost a race with another tap: show whatever was saved first.
  if (!updated?.length) return loadFeedbackView(admin, token);

  if (row.appointment_id) await skipQueuedReviewRuns(admin, row.organization_id, row.appointment_id);
  if (routedTo === "private") {
    const { error: noteError } = await admin.from("notifications").insert({
      organization_id: row.organization_id,
      kind: "review",
      title: `${row.customer_name} rated a recent job ${rating}★`,
      body: "They were offered a private way to tell you what went wrong. Any note they leave appears on your Reviews page.",
      link: "/app/reviews",
    });
    if (noteError) console.error("[review-feedback] owner notification failed", noteError.message);
  }
  return view({ ...row, rating, routed_to: routedTo }, business);
}

/** Saves the private note once, as an unpublished review the owner sees on /app/reviews. */
export async function recordPrivateFeedback(admin: Db, token: string, text: unknown): Promise<FeedbackView | null> {
  const row = await loadRow(admin, token);
  if (!row) return null;
  const business = await businessFor(admin, row.organization_id);
  const feedback = cleanFeedback(text);
  if (row.routed_to !== "private" || row.rating == null || row.feedback || !feedback) return view(row, business);

  const { data: claimed, error } = await admin
    .from("review_feedback_requests")
    .update({ feedback })
    .eq("id", row.id)
    .is("feedback", null)
    .select("id");
  if (error) throw new Error(`Couldn't save the note: ${error.message}`);
  if (!claimed?.length) return loadFeedbackView(admin, token);

  const { data: review, error: reviewError } = await admin
    .from("reviews")
    .insert({
      organization_id: row.organization_id,
      appointment_id: row.appointment_id,
      author_name: row.customer_name.slice(0, 200),
      rating: row.rating,
      private_feedback: feedback,
      is_published: false,
    })
    .select("id")
    .maybeSingle();
  if (reviewError) console.error("[review-feedback] private review copy failed", reviewError.message);
  else if (review?.id) await admin.from("review_feedback_requests").update({ review_id: review.id }).eq("id", row.id);

  return view({ ...row, feedback }, business);
}
