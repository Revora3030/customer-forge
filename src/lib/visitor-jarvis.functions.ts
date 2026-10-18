import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { GROWTH_SYSTEM, usdExact } from "./offer";
import { BUSINESS } from "./business-identity";
import { parseVisitorReply, visitorSpokenText, type VisitorTurn, type VisitorReply, type VisitorVoice } from "./visitor-jarvis";

/**
 * Jarvis for visitors to revoragrowthsystems.com: answers questions about
 * Revora from the real offer and features only, and walks interested
 * business owners to signup, the free trial, or importing their existing
 * website. Anonymous, free models only, and rate-limited per visitor and per
 * server so it can't be used to burn the AI allowance.
 */

const PER_VISITOR = 20;
const VISITOR_WINDOW_MS = 10 * 60_000;
const PER_SERVER_HOUR = 600;
const visitors = new Map<string, number[]>();
let serverHits: number[] = [];

function allow(key: string): boolean {
  const now = Date.now();
  serverHits = serverHits.filter((at) => now - at < 3_600_000);
  if (serverHits.length >= PER_SERVER_HOUR) return false;
  const hits = (visitors.get(key) ?? []).filter((at) => now - at < VISITOR_WINDOW_MS);
  if (hits.length >= PER_VISITOR) return false;
  hits.push(now);
  visitors.set(key, hits);
  serverHits.push(now);
  if (visitors.size > 5000) visitors.delete(visitors.keys().next().value as string);
  return true;
}

function visitorKey(): string {
  try {
    const headers = getRequest().headers;
    // Only edge-controlled IP headers; X-Forwarded-For can be spoofed.
    return headers.get("cf-connecting-ip")?.trim() || headers.get("true-client-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// ElevenLabs costs per character. The real cap is the database's daily
// 'visitor' budget, charged by the stream route when a link is played; this
// per-isolate hourly allowance is only a cheap pre-filter. Past either, the
// browser voice reads the reply instead.
const VOICE_CHARS_PER_HOUR = 30_000;
let voiceUse: { at: number; chars: number }[] = [];

/** Signed ElevenLabs links for this reply only, so the voice can never be used to read arbitrary text. */
async function replyVoice(reply: string): Promise<VisitorVoice | undefined> {
  // voiceConfig() is the one source of the (trimmed) key that also verifies links.
  let apiKey: string | undefined;
  try {
    apiKey = (await import("./jarvis-voice.server")).voiceConfig().apiKey;
  } catch {
    apiKey = undefined;
  }
  if (!apiKey) return undefined;
  const { splitSpeech } = await import("./speech-chunks");
  const { signVoiceLink } = await import("./jarvis-voice-token.server");
  const text = visitorSpokenText(reply);
  const chunks = splitSpeech(text);
  const chars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const now = Date.now();
  voiceUse = voiceUse.filter((entry) => now - entry.at < 3_600_000);
  if (!chunks.length || voiceUse.reduce((sum, entry) => sum + entry.chars, 0) + chars > VOICE_CHARS_PER_HOUR) return undefined;
  voiceUse.push({ at: now, chars });
  const links: Record<string, string> = {};
  for (const chunk of chunks) links[chunk] = await signVoiceLink(apiKey, chunk, "visitor");
  return { text, links };
}

const offer = GROWTH_SYSTEM;

export function visitorSystemPrompt(page: string): string {
  return [
    "You are Jarvis, Revora's assistant on revoragrowthsystems.com, talking with a visitor who is probably a local business owner.",
    "Goal: understand their business and what they need, answer honestly and briefly, and help them start when it fits. Be warm, direct and specific to their trade. Ask one question at a time.",
    `What Revora is: ${offer.positioning} The AI team builds the website, then it runs instant quotes, online booking, a CRM for every lead, automatic follow-up, review requests, local SEO and analytics. Businesses in any industry and any city can sign up online. Revora is fully remote.`,
    `Price, exactly: ${usdExact(offer.setupPrice)} one-time setup, the first month of the platform free, then ${usdExact(offer.monthlyPrice)}/month. Cancel anytime. New accounts can try everything free for ${offer.fullAccessWindow} with no card.`,
    `Setup includes: ${offer.setupIncludes.join(", ")}. Monthly includes: ${offer.monthlyIncludes.join(", ")}.`,
    "Existing website: an owner can paste their current website address during signup. Revora reads the details they already publish (name, phone, hours, services, logo, photo) and the AI team builds a faster version that wins more leads, which they can keep editing like any Revora site.",
    `Contact: ${BUSINESS.email}. Hours: ${BUSINESS.hours.display}.`,
    "Rules: never invent features, integrations, results, customers, reviews, guarantees, discounts or deadlines. Never promise rankings or a number of leads. If you don't know, say so and offer the contact email. Never ask for passwords or card details. Don't collect personal data in chat; signup collects it.",
    "Keep replies under 90 words, plain text, no markdown tables. The visitor may be listening to you read aloud, so write the way you'd say it.",
    'When the visitor is ready or asks how to start, end your reply with exactly one tag on its own line: [[start]] to create a free account, [[upgrade]] if they have an existing website to bring, [[audit]] for a free website audit, or [[pricing]] to see pricing. At most one tag.',
    `The visitor is on ${page}.`,
  ].join("\n");
}

export const askVisitorJarvis = createServerFn({ method: "POST" })
  .validator((input: { turns: VisitorTurn[]; page?: string; voice?: boolean }) => {
    const turns = (Array.isArray(input?.turns) ? input.turns : [])
      .slice(-10)
      .map((turn) => ({
        role: turn?.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(turn?.content ?? "").trim().slice(0, 800),
      }))
      .filter((turn) => turn.content);
    if (!turns.length || turns[turns.length - 1]!.role !== "user") throw new Error("Type a question first.");
    const page = typeof input?.page === "string" && /^\/[A-Za-z0-9/_.-]{0,120}$/.test(input.page) ? input.page : "/";
    return { turns, page, voice: input?.voice === true };
  })
  .handler(async ({ data }): Promise<VisitorReply> => {
    if (!allow(visitorKey()))
      return {
        reply: `I'm getting a lot of questions right now. You can start free in a minute, or email ${BUSINESS.email} and a person will answer.`,
        action: "start",
      };
    try {
      const { generateText } = await import("@/lib/ai/router.server");
      const result = await generateText(
        { task: "public.visitor_jarvis" },
        {
          role: "conversation",
          freeOnly: true,
          maxOutputTokens: 400,
          temperature: 0.4,
          messages: [{ role: "system", content: visitorSystemPrompt(data.page) }, ...data.turns],
        },
      );
      const parsed = parseVisitorReply(result.text);
      const voice = data.voice ? await replyVoice(parsed.reply).catch(() => undefined) : undefined;
      return voice ? { ...parsed, voice } : parsed;
    } catch (error) {
      console.warn("visitor jarvis failed", (error as Error).message);
      return {
        reply: `I couldn't answer just now. You can try Revora free for ${offer.fullAccessWindow} with no card, or email ${BUSINESS.email}.`,
        action: "start",
      };
    }
  });
