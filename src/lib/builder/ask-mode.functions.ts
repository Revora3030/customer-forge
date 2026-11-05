/**
 * Ask mode server path (COMP-2 + LOV-1). READ-ONLY by construction: this file
 * only ever reads (see ask-mode.server.ts) and hands the AI no tools.
 * `ask-mode.functions.test.ts` fails if a write call appears.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ASK_QUESTION_LIMIT, type AskAnswer } from "@/lib/builder/ask-mode";

export const askAboutSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ organizationId: z.string().uuid(), question: z.string().trim().min(1).max(ASK_QUESTION_LIMIT) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AskAnswer> => {
    const { answerAskQuestion } = await import("@/lib/builder/ask-mode.server");
    return answerAskQuestion(context.supabase, String(context.userId), data);
  });
