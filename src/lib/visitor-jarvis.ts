/** Shared, browser-safe pieces of the visitor Jarvis (see visitor-jarvis.functions.ts). */
import { speakableText } from "./jarvis-actions";

export type VisitorTurn = { role: "user" | "assistant"; content: string };

export type VisitorAction = "start" | "upgrade" | "audit" | "pricing";

/**
 * `voice` is present when the visitor turned sound on and ElevenLabs is set
 * up: `text` is exactly what to read aloud and `links` maps each spoken
 * chunk (splitSpeech of `text`) to a signed two-minute ElevenLabs link.
 */
export type VisitorVoice = { text: string; links: Record<string, string> };

export type VisitorReply = { reply: string; action: VisitorAction | null; voice?: VisitorVoice };

/** The most the visitor Jarvis reads aloud per reply. */
export const VISITOR_SPOKEN_MAX = 700;

/**
 * Exactly what the visitor Jarvis reads aloud for a reply. The server signs
 * ElevenLabs links for splitSpeech() of this text and the browser speaks the
 * same text, so every spoken chunk has a matching link. Web addresses are
 * dropped: read aloud they come out split at every dot.
 */
export function visitorSpokenText(reply: string): string {
  return speakableText(reply)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bwww\.\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, VISITOR_SPOKEN_MAX)
    .trim();
}

const ACTIONS: VisitorAction[] = ["start", "upgrade", "audit", "pricing"];

/** Splits the model's reply from its one optional [[action]] tag. */
export function parseVisitorReply(raw: string): VisitorReply {
  const tags = [...raw.matchAll(/\[\[\s*(start|upgrade|audit|pricing)\s*\]\]/gi)].map((match) => match[1]!.toLowerCase() as VisitorAction);
  const reply = raw
    .replace(/\[\[[^\]]*\]\]/g, "")
    // Replies render as plain text; removing every angle bracket leaves
    // nothing that could become markup anywhere.
    .replace(/[<>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1200);
  const action = tags.find((tag) => ACTIONS.includes(tag)) ?? null;
  return { reply: reply || "Happy to help. What kind of business do you run?", action };
}

/** The button each action shows. "upgrade" signs up like "start"; the saved starter flag makes onboarding import the site. */
export const VISITOR_ACTION_LABEL: Record<VisitorAction, string> = {
  start: "Start free — no card",
  upgrade: "Upgrade my existing website",
  audit: "Get my free website audit",
  pricing: "See pricing",
};
