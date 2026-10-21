/**
 * Perplexity Agent API — web-grounded answers. Server-only.
 *
 * Uses the workspace owner's own Perplexity key (`PERPLEXITY_API_KEY_1`, a
 * `pplx-` key) against the Perplexity API directly. `PERPLEXITY_API_KEY` is the
 * separate Lovable-managed connection key and is gateway/Search-API-only — it
 * must never be sent to api.perplexity.ai.
 *
 * Answers are third-party research with citations: evidence for a human or an
 * AI checkpoint to review, never a verified business fact. The key is read at
 * call time and never logged.
 */

import Perplexity from "@perplexity-ai/perplexity_ai";

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
  reason: "not_configured" | "quota_exhausted" | "rate_limited" | "provider_error";
  detail: string;
  retryAfterSeconds?: number;
};

export type AgentRequest = {
  input: string;
  preset?: AgentPreset;
  instructions?: string;
  maxOutputTokens?: number;
  environment?: Readonly<Record<string, string | undefined>>;
};

const ENDPOINT = "https://api.perplexity.ai/v1/agent";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" ? (value as UnknownRecord) : null;

function extractCitations(output: unknown): string[] {
  const urls = new Set<string>();
  if (!Array.isArray(output)) return [];
  for (const item of output) {
    const record = asRecord(item);
    if (!record || record["type"] !== "message" || !Array.isArray(record["content"])) continue;
    for (const content of record["content"]) {
      const part = asRecord(content);
      if (!part || part["type"] !== "output_text" || !Array.isArray(part["annotations"])) continue;
      for (const annotation of part["annotations"]) {
        const note = asRecord(annotation);
        const url = typeof note?.["url"] === "string" ? note["url"] : null;
        if (url) urls.add(url);
      }
    }
  }
  return [...urls];
}

function extractSearchResults(output: unknown): AgentSearchResult[] {
  const results: AgentSearchResult[] = [];
  if (!Array.isArray(output)) return results;
  for (const item of output) {
    const record = asRecord(item);
    if (!record || record["type"] !== "search_results" || !Array.isArray(record["results"])) continue;
    for (const result of record["results"]) {
      const entry = asRecord(result);
      const url = typeof entry?.["url"] === "string" ? entry["url"] : null;
      if (!url) continue;
      results.push({ title: typeof entry["title"] === "string" ? entry["title"] : null, url });
    }
  }
  return results;
}

function classifyError(error: unknown): AgentFailure {
  const record = asRecord(error);
  const status = typeof record?.["status"] === "number" ? record["status"] : null;
  const bodyText = JSON.stringify(record?.["error"] ?? record?.["message"] ?? "");
  if (status === 401 && bodyText.includes("insufficient_quota")) {
    return {
      ok: false,
      reason: "quota_exhausted",
      detail:
        "Perplexity API credits are exhausted on the owner's account. Buy credits at https://console.perplexity.ai — API credits are separate from a Perplexity Pro subscription.",
    };
  }
  if (status === 429) {
    const headers = asRecord(record?.["headers"]);
    const retryAfterRaw = headers?.["retry-after"];
    const retryAfterSeconds =
      typeof retryAfterRaw === "string" && Number.isFinite(Number(retryAfterRaw))
        ? Number(retryAfterRaw)
        : undefined;
    return {
      ok: false,
      reason: "rate_limited",
      detail: "Perplexity rate limit hit; honor Retry-After before retrying.",
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    reason: "provider_error",
    detail: `Perplexity Agent request failed${status ? ` [${status}]` : ""}: ${message.slice(0, 500)}`,
  };
}

export async function runPerplexityAgent(request: AgentRequest): Promise<AgentAnswer | AgentFailure> {
  const env = request.environment ?? process.env;
  const apiKey = env["PERPLEXITY_API_KEY_1"];
  if (!apiKey) {
    return {
      ok: false,
      reason: "not_configured",
      detail: "PERPLEXITY_API_KEY_1 is not configured; link the owner's own Perplexity connection.",
    };
  }

  const client = new Perplexity({ apiKey });
  try {
    const response = await client.responses.create({
      preset: request.preset ?? "fast",
      input: request.input,
      ...(request.instructions ? { instructions: request.instructions } : {}),
      ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
    });
    const record = asRecord(response) ?? {};
    return {
      ok: true,
      id: typeof record["id"] === "string" ? record["id"] : "",
      model: typeof record["model"] === "string" ? record["model"] : null,
      text: typeof record["output_text"] === "string" ? record["output_text"] : "",
      citations: extractCitations(record["output"]),
      searchResults: extractSearchResults(record["output"]),
    };
  } catch (error) {
    return classifyError(error);
  }
}

export { ENDPOINT as PERPLEXITY_AGENT_ENDPOINT };
