/**
 * LOV-8 closeout — owner agent can cite /help articles (read-only, no DB).
 */
import { z } from "zod";
import { defineToolV2, type ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import { matchHelpArticles } from "@/lib/help-articles";

const MAX = 8;

export const helpLookup = () =>
  defineToolV2({
    name: "help.lookup",
    description:
      "Look up Revora owner help articles that match a short question. Returns titles, descriptions, and citeable /help/<slug> paths (plus .md twins). Read-only; never invents answers beyond the published help index.",
    risk: "read",
    scope: "owner",
    schema: z.strictObject({
      query: z.string().trim().min(1).max(120).describe("Short owner question, e.g. \"how does billing work\""),
      limit: z.number().int().min(1).max(MAX).optional().describe(`Max articles to return (default 5, max ${MAX})`),
    }),
    run: async (input) => {
      const articles = matchHelpArticles(input.query, input.limit ?? 5);
      return {
        query: input.query,
        count: articles.length,
        articles,
        note:
          articles.length === 0
            ? "No published help article matched. Tell the owner to open /help or ask support@revoragrowthsystems.com."
            : "Cite the path fields when answering; do not invent steps not listed in the article.",
      };
    },
  });

export function helpTools(): ToolDefinitionV2<z.ZodType>[] {
  return [helpLookup()] as unknown as ToolDefinitionV2<z.ZodType>[];
}
