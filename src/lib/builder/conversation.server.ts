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
  if (input.hasAttachments && !input.firstBuildActive) return { mode: "change" };
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
      ? "Their FIRST website is being built by the AI team right now (Sol designs and writes it, Terra reviews it). There are no pages to edit yet. ALWAYS use mode \"answer\": reply naturally to what they said; if they ask for a website or pages, confirm the full site is already being built from their real business details and what it will cover; if they ask for a specific change, say you'll apply it the moment the first pages land and they can send it again then."
      : "Decide whether the owner's latest message asks you to CHANGE the website (edit, add, remove, redesign, rewrite, restyle, generate pictures, fix something on the site) or is something to ANSWER (greeting, small talk, a question, asking for advice, ideas, explanations, feedback, how something works).",
    "If it is ANSWER, write a helpful, natural, conversational reply in plain language (markdown allowed, keep it concise). Offer a concrete next step you can do on their site when useful.",
    "Never invent facts about their business, prices, reviews, results or integrations. Revora's own offer is: $750 one-time setup, first month free, then $100/month, with a 1-day full-access trial.",
    'Respond with JSON only: {"mode":"answer"|"change","reply":"..."} — reply is required for answer and empty for change.',
  ].join("\n");
  const turns = [
    ...input.history.slice(-12).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: input.instruction },
  ];
  const decide = (data: Record<string, unknown>): ConversationDecision => {
    const mode = data["mode"];
    const reply = typeof data["reply"] === "string" ? data["reply"].trim() : "";
    if ((mode === "answer" || input.firstBuildActive) && reply)
      return { mode: "answer", reply: reply.slice(0, 3000) };
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
        role: "primary",
        json: true,
        maxOutputTokens: 900,
        messages: [{ role: "system", content: system }, ...turns],
      },
    );
    return decide(result.data);
  } catch (error) {
    console.warn("builder conversation step unavailable", (error as Error).message);
    return { mode: "change" };
  }
}
