/**
 * COMP-14: quotes.summary and reviews.summary (read-only, owner workspace).
 *
 * Counts only, so an owner can ask "how are my quotes and reviews doing?"
 * without the model reading customer names or review text. The per-record
 * read tools (quotes.list/get, reviews.list/find_unanswered) belong to PAI-7;
 * these two have different names so both groups can sit in one registry.
 * Every number is counted from the rows read; nothing is estimated, and a
 * window with no rows says so (rating is null, not 0).
 */
import { z } from "zod";
import type { ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { db, readFailed } from "./shared";

/** Most rows one summary will count. Beyond this the result says it is partial. */
export const SUMMARY_ROW_CAP = 1000;
const DAY_MS = 86_400_000;

const windowSchema = () => z.strictObject({ days: z.number().int().min(1).max(365).optional() });

function sinceIso(days: number, now = Date.now()) {
  return new Date(now - days * DAY_MS).toISOString();
}

export const quotesSummary = () =>
  defineToolV2({
    name: "quotes.summary",
    description:
      "Counts of this workspace's quotes by status over the last N days (default 90), with how many were accepted. Counts only: no customer details.",
    risk: "read",
    scope: "owner",
    schema: windowSchema(),
    run: async (input, context) => {
      const days = input.days ?? 90;
      const { data, error } = await db(context)
        .from("quotes")
        .select("status")
        .eq("organization_id", context.organizationId)
        .gte("created_at", sinceIso(days))
        .limit(SUMMARY_ROW_CAP);
      if (error) readFailed(error);
      const rows = (data ?? []) as Array<{ status: string }>;
      const by_status: Record<string, number> = {};
      for (const row of rows) by_status[row.status] = (by_status[row.status] ?? 0) + 1;
      const accepted = by_status["accepted"] ?? 0;
      return {
        days,
        total: rows.length,
        by_status,
        accepted,
        accepted_share: rows.length > 0 ? Math.round((accepted / rows.length) * 100) : null,
        partial: rows.length >= SUMMARY_ROW_CAP,
      };
    },
  });

export const reviewsSummary = () =>
  defineToolV2({
    name: "reviews.summary",
    description:
      "Review counts for this workspace over the last N days (default 90): how many, average rating, how many of each star, published and low ratings (3 or less). No names or text.",
    risk: "read",
    scope: "owner",
    schema: windowSchema(),
    run: async (input, context) => {
      const days = input.days ?? 90;
      const { data, error } = await db(context)
        .from("reviews")
        .select("rating, is_published")
        .eq("organization_id", context.organizationId)
        .gte("created_at", sinceIso(days))
        .limit(SUMMARY_ROW_CAP);
      if (error) readFailed(error);
      const rows = (data ?? []) as Array<{ rating: number; is_published: boolean }>;
      const stars: Record<"1" | "2" | "3" | "4" | "5", number> = {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
      };
      let sum = 0;
      let rated = 0;
      for (const row of rows) {
        const r = Math.round(Number(row.rating));
        if (r >= 1 && r <= 5) {
          stars[String(r) as keyof typeof stars] += 1;
          sum += r;
          rated += 1;
        }
      }
      return {
        days,
        total: rows.length,
        average_rating: rated > 0 ? Math.round((sum / rated) * 10) / 10 : null,
        stars,
        published: rows.filter((r) => r.is_published).length,
        low_ratings: stars["1"] + stars["2"] + stars["3"],
        partial: rows.length >= SUMMARY_ROW_CAP,
      };
    },
  });

/** The COMP-14 group: its own exported factory, listed in AGENT_TOOL_GROUPS so PAI-5 limits and kill switches wrap it. */
export function readToolsC(): ToolDefinitionV2<z.ZodType>[] {
  return [quotesSummary(), reviewsSummary()] as unknown as ToolDefinitionV2<z.ZodType>[];
}
