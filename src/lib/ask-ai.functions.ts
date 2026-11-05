import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAskAiInput } from "@/lib/ask-ai";

/**
 * LOV-16: answers an owner's question about their own workspace. Read-only:
 * selects scoped to the caller's organization and one model call without tools.
 * Nothing is saved, sent or changed.
 */
export const askAiAboutWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateAskAiInput)
  .handler(async ({ data, context }) => {
    const [{ buildAskAiAnswer }, { generateText }] = await Promise.all([
      import("@/lib/ask-ai.server"),
      import("@/lib/ai/router.server"),
    ]);
    return buildAskAiAnswer(context.supabase, context.userId, data, {
      generate: async (caller, request) => {
        const result = await generateText(caller, request);
        return { text: result.text, model: result.model };
      },
    });
  });
