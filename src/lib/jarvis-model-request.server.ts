import type { AiMessage, AiRequest } from "@/lib/ai/types";

/** Admin Jarvis shares the router's capped paid/free team, not a private free-only lane. */
export function jarvisModelRequest(messages: AiMessage[], maxOutputTokens: number): AiRequest {
  return { role: "conversation", maxOutputTokens, messages };
}