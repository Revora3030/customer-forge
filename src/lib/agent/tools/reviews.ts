/**
 * reviews.list / reviews.find_unanswered: read-only. Same reviews table the
 * Reviews page uses (queries.useReviews). "Unanswered" = unpublished reviews
 * or low ratings (≤ 3) that still need an owner response; the table has no
 * reply column, so those are the measurable response gaps.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { bounded, db, readFailed } from "./shared";

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  comment: string | null;
  private_feedback: string | null;
  is_published: boolean;
  created_at: string;
  appointment_id: string | null;
};

function summarize(row: ReviewRow) {
  const comment =
    row.comment && row.comment.length > 200 ? `${row.comment.slice(0, 200)}…` : row.comment;
  return {
    id: row.id,
    author_name: row.author_name,
    rating: row.rating,
    comment,
    is_published: row.is_published,
    has_private_feedback: Boolean(row.private_feedback),
    appointment_id: row.appointment_id,
    created_at: row.created_at,
  };
}

export const reviewsList = () =>
  defineToolV2({
  name: "reviews.list",
  description:
    "List this workspace's reviews (newest first). Comment text is truncated; private feedback is never returned.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    publishedOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  run: async (input, context) => {
    const limit = input.limit ?? 50;
    let query = db(context)
      .from("reviews")
      .select(
        "id, author_name, rating, comment, private_feedback, is_published, created_at, appointment_id",
      )
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (input.publishedOnly) query = query.eq("is_published", true);
    const { data, error } = await query;
    if (error) readFailed(error);
    const reviews = ((data ?? []) as ReviewRow[]).map(summarize);
    return bounded({ reviews }, "reviews");
  },
});

export const reviewsFindUnanswered = () =>
  defineToolV2({
  name: "reviews.find_unanswered",
  description:
    "Reviews that still need an owner response: unpublished ones, or ratings of 3 or lower. Private feedback text is never returned.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    limit: z.number().int().min(1).max(50).optional(),
  }),
  run: async (input, context) => {
    const limit = input.limit ?? 50;
    // Fetch a bit more than the cap so we can filter client-side (OR of
    // unpublished / low rating) without inventing a custom RPC.
    const { data, error } = await db(context)
      .from("reviews")
      .select(
        "id, author_name, rating, comment, private_feedback, is_published, created_at, appointment_id",
      )
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) readFailed(error);
    const unanswered = ((data ?? []) as ReviewRow[])
      .filter((row) => !row.is_published || row.rating <= 3)
      .slice(0, limit)
      .map((row) => ({
        ...summarize(row),
        reason: !row.is_published ? "unpublished" : "low_rating",
      }));
    return bounded({ unanswered }, "unanswered");
  },
});
