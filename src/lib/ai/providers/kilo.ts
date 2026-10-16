/**
 * Kilo Code gateway adapter — its keyless free models (":free" ids, 200
 * requests an hour per IP). The auto-routers are excluded because they may
 * send prompts to providers that log them.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const kiloAdapter = createOpenAiCompatibleAdapter({ name: "kilo", baseUrl: () => "https://api.kilo.ai/api/gateway" });
