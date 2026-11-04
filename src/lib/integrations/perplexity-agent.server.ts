/**
 * Web-grounded research answers ("research.ask"). Server-only.
 *
 * Runs entirely on Lovable paths, per the rule that the Lovable AI Gateway is
 * Revora's only AI provider:
 *   1. live web results come from the Lovable connector-gateway search path in
 *      research.server.ts (`searchWeb`);
 *   2. the answer is written by the Lovable AI router (`generateText`), with an
 *      explicit per-call timeout and chain deadline, and the router's own retry
 *      policy, failover and error categories.
 * Nothing here calls a third-party AI host directly or reads an owner's
 * direct-API key.
 *
 * The exported name and types are kept so callers (perplexity-agent.functions.ts,
 * the Jarvis research card) do not change. Answers are third-party research
 * with citations: evidence for a human or an AI checkpoint to review, never a
 * verified business fact.
 */

import type { RevoraAiError } from "@/lib/ai/errors";

export type AgentPreset = "fast" | "low" | "medium" | "high" | "xhigh";

export type AgentSearchResult = { title: string | null; url: string };

export type AgentAnswer = {
  ok: true;
  id: string;
  model: string | null;
  text: string;
  citations: string[];
  searchResults: AgentSearchResult[];
};

export type AgentFailure = {
  ok: false;
  reason: "not_configured" | "quota_exhausted" | "rate_limited" | "timeout" | "provider_error";
  detail: string;
  retryAfterSeconds?: number;
};

export type AgentRequest = {
  input: string;
  preset?: AgentPreset;
  instructions?: string;
  maxOutputTokens?: number;
  /** Kept for interface compatibility; the Lovable paths read their own configuration. */
  environment?: Readonly<Record<string, string | undefined>>;
};

/** How much each preset searches, writes and waits. Timeouts are per model call; the deadline covers failover. */
export const RESEARCH_PRESETS: Record<AgentPreset, { results: number; tokens: number; timeoutMs: number; chainDeadlineMs: number }> = {
  fast: { results: 5, tokens: 900, timeoutMs: 30_000, chainDeadlineMs: 45_000 },
  low: { results: 6, tokens: 1_200, timeoutMs: 35_000, chainDeadlineMs: 55_000 },
  medium: { results: 8, tokens: 1_600, timeoutMs: 45_000, chainDeadlineMs: 70_000 },
  high: { results: 10, tokens: 2_400, timeoutMs: 60_000, chainDeadlineMs: 90_000 },
  xhigh: { results: 10, tokens: 3_200, timeoutMs: 60_000, chainDeadlineMs: 90_000 },
};

const SYSTEM = [
  "You answer research questions using ONLY the numbered web sources provided.",
  "Cite every claim with its source number in square brackets, like [1] or [2][3].",
  "If the sources do not answer the question, say so plainly instead of guessing.",
  "Be concise. This is third-party research for a person to review, not a verified fact.",
].join(" ");

function isAiError(error: unknown): error is RevoraAiError {
  return error instanceof Error && typeof (error as { category?: unknown }).category === "string";
}

/** Maps the router's error categories onto this module's stable failure reasons. */
function failureFrom(error: unknown): AgentFailure {
  if (!isAiError(error)) {
    return { ok: false, reason: "provider_error", detail: "Revora AI couldn't write a research answer. Try again." };
  }
  const retry = typeof error.retryAfterSeconds === "number" ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  switch (error.category) {
    case "not_configured":
    case "free_unavailable":
      return { ok: false, reason: "not_configured", detail: "Revora AI (Lovable AI Gateway) isn't available for research right now." };
    case "quota":
      return { ok: false, reason: "quota_exhausted", detail: "Revora AI is out of credits for paid research. Add Lovable AI credits, then try again.", ...retry };
    case "rate_limited":
    case "workspace_cooldown":
      return { ok: false, reason: "rate_limited", detail: "Revora AI is rate limited; wait a moment before retrying.", ...retry };
    case "timeout":
      return { ok: false, reason: "timeout", detail: "Revora AI took too long to write the research answer. Try again." };
    default:
      return { ok: false, reason: "provider_error", detail: `Revora AI couldn't write a research answer (${error.category}). Try again.` };
  }
}

/** Source numbers the answer actually cites, in order of first use. */
function citedUrls(text: string, sources: AgentSearchResult[]): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(/\[(\d{1,2})\]/g)) {
    const source = sources[Number(match[1]) - 1];
    if (source && !urls.includes(source.url)) urls.push(source.url);
  }
  return urls;
}

export async function runPerplexityAgent(request: AgentRequest): Promise<AgentAnswer | AgentFailure> {
  const preset = RESEARCH_PRESETS[request.preset ?? "fast"];
  const question = request.input.trim().slice(0, 4_000);

  // 1. Live sources from the Lovable connector-gateway search path.
  const { searchWeb } = await import("./research.server");
  const found = await searchWeb(question, preset.results);
  if (!found.ok) {
    if (found.reason === "not_configured")
      return { ok: false, reason: "not_configured", detail: "Web search isn't connected; link the Perplexity connection in Lovable." };
    if (/timeout|timed out|abort/i.test(`${found.reason} ${found.detail}`))
      return { ok: false, reason: "timeout", detail: "Web search took too long to answer. Try again." };
    if (/\b429\b|rate/i.test(found.detail))
      return { ok: false, reason: "rate_limited", detail: "Web search is rate limited; wait a moment before retrying." };
    return { ok: false, reason: "provider_error", detail: "Web search couldn't be reached, so no research answer was written." };
  }
  const searchResults: AgentSearchResult[] = found.results.map((r) => ({ title: r.title || null, url: r.url }));
  const sourceBlock = found.results.length
    ? found.results.map((r, i) => `[${i + 1}] ${r.title || r.url}\n${r.url}${r.date ? ` (${r.date})` : ""}\n${r.snippet}`).join("\n\n")
    : "(no web results were found)";

  // 2. The answer, written through the Lovable AI router.
  const { generateText } = await import("@/lib/ai/router.server");
  try {
    const result = await generateText(
      { task: "research.ask" },
      {
        messages: [
          { role: "system", content: request.instructions ? `${SYSTEM}\n\n${request.instructions.slice(0, 2_000)}` : SYSTEM },
          { role: "user", content: `Question: ${question}\n\nSources:\n${sourceBlock}` },
        ],
        maxOutputTokens: request.maxOutputTokens ?? preset.tokens,
        timeoutMs: preset.timeoutMs,
        chainDeadlineMs: preset.chainDeadlineMs,
      },
    );
    const text = result.text.trim();
    return {
      ok: true,
      id: result.requestId,
      model: `${result.provider}/${result.model}`,
      text,
      citations: citedUrls(text, searchResults),
      searchResults,
    };
  } catch (error) {
    return failureFrom(error);
  }
}
