import type { AiMessage, AiRequest } from "@/lib/ai/types";
import { JARVIS_ATTEMPT_TIMEOUT_MS, JARVIS_CHAIN_DEADLINE_MS, type RoundBudget } from "./jarvis-turn-deadline";

/**
 * Admin Jarvis shares the router's capped paid/free team, not a private free-only lane. A picked model only leads; the roster stays as failover.
 * Each round carries its own attempt timeout and chain deadline (never above the router's ceilings), capped by what is left of the turn.
 */
export function jarvisModelRequest(messages: AiMessage[], maxOutputTokens: number, pickedModel: string | null = null, budget: RoundBudget | null = null): AiRequest {
  return {
    role: "conversation",
    maxOutputTokens,
    messages,
    timeoutMs: Math.min(JARVIS_ATTEMPT_TIMEOUT_MS, budget?.timeoutMs ?? JARVIS_ATTEMPT_TIMEOUT_MS),
    chainDeadlineMs: Math.min(JARVIS_CHAIN_DEADLINE_MS, budget?.chainDeadlineMs ?? JARVIS_CHAIN_DEADLINE_MS),
    ...(pickedModel ? { preferModels: [pickedModel] } : {}),
  };
}
