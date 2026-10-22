import type { AiMessage, AiRequest } from "@/lib/ai/types";

/** Admin Jarvis shares the router's capped paid/free team, not a private free-only lane. A picked model only leads; the roster stays as failover. */
export function jarvisModelRequest(messages: AiMessage[], maxOutputTokens: number, pickedModel: string | null = null): AiRequest {
  return { role: "conversation", maxOutputTokens, messages, ...(pickedModel ? { preferModels: [pickedModel] } : {}) };
}
