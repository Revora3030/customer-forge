/**
 * Fitting a long conversation into a free model with a small context window.
 *
 * Free models differ a lot in how much they accept. When one refuses a request
 * as too large, the router moves to the next free model and sends it a shorter
 * version built here. Nothing is invented and no extra AI call is made:
 *  - system instructions and the latest message are always kept whole,
 *  - the most recent turns stay in full (each capped in length),
 *  - older turns are folded into a short, labelled excerpt list,
 *  - pictures, video and audio are kept only on the latest message.
 * Each further refusal shrinks the window again.
 */
import type { AiMessage } from "./types";

type Level = { recent: number; recentChars: number; excerptChars: number; excerpts: number };

const LEVELS: Level[] = [
  { recent: 8, recentChars: 6_000, excerptChars: 240, excerpts: 24 },
  { recent: 4, recentChars: 2_000, excerptChars: 120, excerpts: 10 },
  { recent: 2, recentChars: 800, excerptChars: 0, excerpts: 0 },
];

const textOf = (content: AiMessage["content"]) =>
  typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("\n");

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…` : clean;
};

/** Text-only copy of a message, shortened to `max` characters. */
const shortened = (message: AiMessage, max: number): AiMessage => {
  const text = textOf(message.content);
  return { role: message.role, content: text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text };
};

export function compactMessages(messages: AiMessage[], attempt: number): AiMessage[] {
  if (attempt <= 0 || messages.length === 0) return messages;
  const level = LEVELS[Math.min(attempt, LEVELS.length) - 1]!;

  const system = messages.filter((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system");
  if (turns.length === 0) return messages;

  const latest = turns[turns.length - 1]!;
  const recentStart = Math.max(0, turns.length - level.recent);
  const older = turns.slice(0, recentStart);
  const recent = turns.slice(recentStart, -1).map((m) => shortened(m, level.recentChars));

  const out: AiMessage[] = [...system];
  if (older.length) {
    const shown = level.excerpts > 0 ? older.slice(-level.excerpts) : [];
    const lines = shown.map((m) => `- ${m.role}: ${clip(textOf(m.content), level.excerptChars)}`);
    const skipped = older.length - shown.length;
    const note = [
      `Earlier in this conversation (${older.length} older message${older.length === 1 ? "" : "s"} shortened to fit this model):`,
      ...(skipped > 0 ? [`- ${skipped} earlier message${skipped === 1 ? "" : "s"} omitted.`] : []),
      ...lines,
    ].join("\n");
    // Folded into the system channel so user/assistant turns still alternate.
    const last = out[out.length - 1];
    if (last && typeof last.content === "string") out[out.length - 1] = { role: "system", content: `${last.content}\n\n${note}` };
    else out.push({ role: "system", content: note });
  }
  out.push(...recent, latest);
  return out;
}

export function messageCharCount(messages: AiMessage[]) {
  return messages.reduce((sum, m) => sum + textOf(m.content).length, 0);
}
