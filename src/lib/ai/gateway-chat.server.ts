/**
 * Direct streamed call to the Lovable AI Gateway Responses API for short,
 * latency-sensitive chat turns. The stream is consumed server-side and the
 * final text returned. Errors throw with the gateway status so callers can
 * fall back honestly.
 */
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export class GatewayChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function gatewayChatText(input: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  json?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new GatewayChatError("AI gateway key is not configured", 401);
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      Authorization: `Bearer ${key}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      ...(input.json ? { text: { format: { type: "json_object" } } } : {}),
      input: [
        { role: "system", content: input.system },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  void response.headers.get(RUN_ID_HEADER);
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new GatewayChatError(`AI gateway ${response.status}: ${detail.slice(0, 200)}`, response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: { type?: string; delta?: string; text?: string; response?: { error?: { message?: string } } };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
      else if (event.type === "response.output_text.done" && typeof event.text === "string") text = event.text;
      else if (event.type === "response.failed" || event.type === "error") {
        throw new GatewayChatError(event.response?.error?.message ?? "AI gateway stream failed", 502);
      } else if (event.type === "response.completed") done = true;
    }
  }
  if (!text.trim()) throw new GatewayChatError("AI gateway returned no text", 502);
  return text;
}
