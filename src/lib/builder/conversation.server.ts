/**
 * Conversational turn for the builder chat. Before any design work, the model
 * team reads the owner's message and decides: is this a request to change the
 * website, or something to simply answer (a greeting, a question, advice)?
 * Answers come straight from the AI — never a canned reply. When the models
 * are unreachable the message goes on to the normal change path unchanged.
 */
import { generateStructuredOutput } from "@/lib/ai/router.server";

type Turn = { role: "user" | "assistant"; content: string };

export type ConversationDecision =
  | { mode: "answer"; reply: string }
  | { mode: "change" };

export async function decideConversation(input: {
  organizationId: string;
  userId: string;
  instruction: string;
  history: Turn[];
  hasAttachments: boolean;
  business: { name: string; industry: string | null };
  pages: { title: string; slug: string; sectionCount: number }[];
}): Promise<ConversationDecision> {
  if (input.hasAttachments) return { mode: "change" };
  const siteMap = input.pages
    .slice(0, 20)
    .map((page) => `- ${page.title} (/${page.slug}, ${page.sectionCount} sections)`)
    .join("\n");
  const system = [
    "You are Revora, the AI website builder and growth partner inside Revora Growth Systems.",
    "You talk with a business owner about their website like a warm, sharp senior designer and growth strategist.",
    `Their business: ${input.business.name}${input.business.industry ? ` (${input.business.industry})` : ""}.`,
    `Their website pages:\n${siteMap || "- none yet"}`,
    "Decide whether the owner's latest message asks you to CHANGE the website (edit, add, remove, redesign, rewrite, restyle, generate pictures, fix something on the site) or is something to ANSWER (greeting, small talk, a question, asking for advice, ideas, explanations, feedback, how something works).",
    "If it is ANSWER, write a helpful, natural, conversational reply in plain language (markdown allowed, keep it concise). Offer a concrete next step you can do on their site when useful.",
    "Never invent facts about their business, prices, reviews, results or integrations. Revora's own offer is: $750 one-time setup, first month free, then $100/month, with a 3-day full-access trial.",
    'Respond with JSON only: {"mode":"answer"|"change","reply":"..."} — reply is required for answer and empty for change.',
  ].join("\n");
  try {
    const result = await generateStructuredOutput(
      { organizationId: input.organizationId, userId: input.userId, task: "builder.converse" },
      {
        role: "primary",
        json: true,
        maxOutputTokens: 900,
        messages: [
          { role: "system", content: system },
          ...input.history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content })),
          { role: "user", content: input.instruction },
        ],
      },
    );
    const mode = result.data["mode"];
    const reply = typeof result.data["reply"] === "string" ? result.data["reply"].trim() : "";
    if (mode === "answer" && reply) return { mode: "answer", reply: reply.slice(0, 3000) };
    return { mode: "change" };
  } catch (error) {
    console.warn("builder conversation step unavailable", (error as Error).message);
    return { mode: "change" };
  }
}
