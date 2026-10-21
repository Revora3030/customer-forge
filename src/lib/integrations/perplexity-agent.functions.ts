/**
 * Web-grounded answer capability backed by the Perplexity Agent API.
 *
 * `askPerplexityAgent` is the app-facing entry point: signed-in users only, and
 * it spends the owner's own Perplexity credits, so it honors the platform's
 * free-only / paid-spend gate before calling out. Answers come back with
 * citations and are research evidence, never verified business facts.
 *
 * `verifyPerplexityAgent` is a super-admin-only smoke check: it makes one
 * minimal real request so the owner can confirm the key works. It bypasses the
 * free-only gate by design and is the only path that does.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const askInput = z.object({
  question: z.string().min(1).max(4_000),
  preset: z.enum(["fast", "low", "medium", "high", "xhigh"]).optional(),
  instructions: z.string().max(2_000).optional(),
});

export const askPerplexityAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => askInput.parse(data))
  .handler(async ({ data }) => {
    const { paidCollectiveAllowed } = await import("@/lib/ai/free-only-policy.server");
    if (!paidCollectiveAllowed("research.web")) {
      return {
        ok: false as const,
        reason: "free_only_mode" as const,
        detail:
          "Free-only mode is on, so paid research calls are paused. Turn the zero-cost flag off to use web-grounded answers.",
      };
    }
    const { runPerplexityAgent } = await import("./perplexity-agent.server");
    return runPerplexityAgent({
      input: data.question,
      ...(data.preset ? { preset: data.preset } : {}),
      ...(data.instructions ? { instructions: data.instructions } : {}),
    });
  });

export const verifyPerplexityAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );
    const { runPerplexityAgent } = await import("./perplexity-agent.server");
    const outcome = await runPerplexityAgent({
      preset: "fast",
      input: "What is today's date in UTC? Answer with the date only.",
      maxOutputTokens: 64,
    });
    // Report the response shape only — never the key or the raw payload.
    if (!outcome.ok) {
      return { ok: false as const, reason: outcome.reason, detail: outcome.detail };
    }
    return {
      ok: true as const,
      id: outcome.id,
      model: outcome.model,
      textLength: outcome.text.length,
      citationCount: outcome.citations.length,
      searchResultCount: outcome.searchResults.length,
    };
  });
