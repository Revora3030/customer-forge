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
  /** True while the first website build is running and no page exists yet. */
  firstBuildActive?: boolean;
  /** Full description of the live site: sections, headings, copy, services, brand. */
  siteDetail?: string;
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
    input.siteDetail
      ? `FULL CURRENT CONTENT OF THEIR WEBSITE (you can see all of this):\n${input.siteDetail.slice(0, 14000)}`
      : "",
    "WHAT YOU CAN DO: you have full access to this website. You can see every page, section, heading, text, service, colour and photo listed above, and on request you can edit copy, add/remove/reorder sections and pages, restyle colours and fonts, generate or swap photos, improve search titles, and the owner can publish from the builder. Never say you lack access, cannot see the site, or are blocked. When asked to rate or review the site, judge the real content above specifically and offer concrete changes you can apply right away.",
    input.firstBuildActive
      ? "Their FIRST website is being built by the AI team right now (Sol designs and writes it, Terra reviews it). A requested change is saved and applied automatically the moment the first pages land — the owner never has to resend it.\n"
      : "",
    "Decide whether the owner's latest message asks you to CHANGE the website (edit, add, remove, redesign, rewrite, restyle, generate pictures, fix something on the site) or is something to ANSWER (greeting, small talk, a pure question, explanations, how something works). Anything that asks you to improve, fix, upgrade, make better, add, change, apply your suggestions, or 'do it' / 'yes' after you proposed changes is ALWAYS mode \"change\" — the change is applied to the live site immediately, so never just describe it.",
    "If it is ANSWER, write a helpful, natural, conversational reply in plain language (markdown allowed). Match the length to the question: short for small talk, as thorough as needed for reviews, plans, strategy and explanations — never cut a useful answer short. When you suggest improvements, list them concretely and tell the owner that replying \"do it\" applies them straight to the site.",
    "Never invent facts about their business, prices, reviews, results or integrations. Revora's own offer is: $750 one-time setup, first month free, then $100/month, with a 3-day full-access trial.",
    'Respond with JSON only: {"mode":"answer"|"change","reply":"..."} — reply is required for answer and empty for change.',
  ].join("\n");
  const turns = [
    ...input.history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: input.instruction },
  ];
  const decide = (data: Record<string, unknown>): ConversationDecision => {
    const mode = data["mode"];
    const reply = typeof data["reply"] === "string" ? data["reply"].trim() : "";
    if (mode === "answer" && reply)
      return { mode: "answer", reply: reply.slice(0, 20000) };
    return { mode: "change" };
  };
  // Primary: Revora's main model through the AI gateway (fast, reliable).
  try {
    const { gatewayChatText } = await import("@/lib/ai/gateway-chat.server");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const text = await gatewayChatText({ system, messages: turns, json: true, signal: controller.signal });
      const match = text.match(/\{[\s\S]*\}/);
      return decide(JSON.parse(match ? match[0] : text) as Record<string, unknown>);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn("builder conversation gateway unavailable", (error as Error).message);
  }
  // Backup: the provider router (free pool).
  try {
    const result = await generateStructuredOutput(
      { organizationId: input.organizationId, userId: input.userId, task: "builder.converse" },
      {
        role: "conversation",
        json: true,
        maxOutputTokens: 6000,
        messages: [{ role: "system", content: system }, ...turns],
      },
    );
    return decide(result.data);
  } catch (error) {
    console.warn("builder conversation step unavailable", (error as Error).message);
    return fallbackDecision(input.instruction);
  }
}

/**
 * When no model can decide, guess from the words. A greeting or a question used
 * to be treated as a site edit, sending "hi" or "how much is it?" into the full
 * redesign planner. Only a message that clearly asks for a change goes there;
 * anything else gets an honest short answer.
 */
export function fallbackDecision(instruction: string): ConversationDecision {
  const text = instruction.trim().toLowerCase();
  const asksForChange =
    /\b(add|change|edit|update|replace|remove|delete|make|redesign|rewrite|restyle|fix|improve|move|swap|put|use|set|turn|apply|do it|go ahead|yes|generate|create|build)\b/.test(text);
  const smallTalk = /^(hi|hey|hello|yo|thanks|thank you|ok|okay|cool|great|good (morning|afternoon|evening))[!. ]*$/.test(text);
  if (asksForChange && !smallTalk) return { mode: "change" };
  return {
    mode: "answer",
    reply: smallTalk
      ? "Hi! I'm here. Tell me what you'd like to change on your website — a section, the wording, photos or colours — and I'll do it."
      : "I couldn't reach the AI team to answer that just now. Please ask again in a moment — or tell me exactly what to change on the site and I'll start on it.",
  };
}
