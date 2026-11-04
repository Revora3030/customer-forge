/**
 * Capability-routed web research. Server-only.
 *
 * The builder asks for `research.web` — never for a vendor. Firecrawl serves it
 * when it is authorized and paid providers are allowed; otherwise Revora's own
 * SSRF-guarded reader does, which is always available. Either way the result
 * carries its source URL and fetch time, is clearly marked as *research* rather
 * than a verified business fact, and is truncated so a page can never flood a
 * prompt or a record.
 *
 * Research never writes to a customer's content. Callers treat it as evidence
 * that needs approval before it becomes copy.
 */

import { callCapability } from "@/lib/integrations/registry.server";
import { htmlToText } from "@/lib/html-text";

export type ResearchSource = {
  url: string;
  fetchedAt: string;
  provider: string;
  /** Never presented as a business fact — this is third-party material. */
  trust: "research";
};

export type ResearchExtract = {
  source: ResearchSource;
  title: string | null;
  description: string | null;
  /** Plain text, capped. Never stored as the customer's own copy. */
  text: string;
};

export type ResearchOutcome =
  | { ok: true; extract: ResearchExtract }
  | { ok: false; reason: string; detail: string };

const MAX_TEXT = 8_000;

const strip = (html: string) => htmlToText(html, { maxLength: MAX_TEXT });

const meta = (html: string, name: string) => {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']{1,300})["']`,
    "i",
  );
  return pattern.exec(html)?.[1]?.trim() ?? null;
};

const titleOf = (html: string) =>
  /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim() ?? null;

async function firecrawl(url: string, signal: AbortSignal): Promise<ResearchExtract> {
  const key = process.env["FIRECRAWL_API_KEY"]!;
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal,
  });
  if (!response.ok) throw new Error(`firecrawl_${response.status}`);
  const payload = (await response.json()) as {
    markdown?: string;
    data?: { markdown?: string; metadata?: Record<string, unknown> };
    metadata?: Record<string, unknown>;
  };
  const markdown = payload.markdown ?? payload.data?.markdown ?? "";
  const metadata = payload.metadata ?? payload.data?.metadata ?? {};
  return {
    source: { url, fetchedAt: new Date().toISOString(), provider: "firecrawl", trust: "research" },
    title: typeof metadata["title"] === "string" ? metadata["title"] : null,
    description: typeof metadata["description"] === "string" ? metadata["description"] : null,
    text: markdown.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT),
  };
}

async function native(url: string, signal: AbortSignal): Promise<ResearchExtract> {
  const { guardedFetch } = await import("@/lib/net-guard.server");
  const response = await guardedFetch(
    url,
    { headers: { "user-agent": "RevoraResearch/1.0" }, signal },
  );
  if (!response.ok) throw new Error(`page_${response.status}`);
  const html = (await response.text()).slice(0, 400_000);
  return {
    source: {
      url,
      fetchedAt: new Date().toISOString(),
      provider: "revora-native-fetch",
      trust: "research",
    },
    title: titleOf(html),
    description: meta(html, "description"),
    text: strip(html),
  };
}

/** Reads one public page through whichever provider is authorized. */
export async function researchPage(url: string): Promise<ResearchOutcome> {
  const result = await callCapability<ResearchExtract>(
    "research.web",
    async ({ provider, signal }) =>
      provider.id === "firecrawl" ? firecrawl(url, signal) : native(url, signal),
    { timeoutMs: 12_000, validate: (value) => value.text.length > 0 || value.title !== null },
  );
  if (result.ok) return { ok: true, extract: result.data };
  return {
    ok: false,
    reason: result.reason,
    detail:
      result.reason === "timeout"
        ? "That page took too long to answer, so nothing was read from it."
        : "That page couldn't be read, so nothing from it was used.",
  };
}

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  source: ResearchSource;
};

export type WebSearchOutcome =
  | { ok: true; results: WebSearchResult[] }
  | { ok: false; reason: string; detail: string; retryAfterSeconds?: number };

const key = (...names: string[]) => names.map((name) => process.env[name]?.trim()).find(Boolean) ?? null;

/**
 * The single web-search path: Perplexity search through the Lovable connector
 * gateway. Per the rule that Lovable is Revora's only AI provider, there is no
 * direct third-party search or AI host here and no fallback outside Lovable.
 */
const LOVABLE_PERPLEXITY_SEARCH = "https://connector-gateway.lovable.dev/perplexity/search";
export const SEARCH_TIMEOUT_MS = 15_000;
const SEARCH_PROVIDER_ID = "perplexity";

const lovableSearchConfigured = () => Boolean(key("LOVABLE_API_KEY") && key("PERPLEXITY_API_KEY"));

/** Search providers that are configured. Only the Lovable connector path exists. */
export function configuredSearchProviders(): string[] {
  return lovableSearchConfigured() ? [SEARCH_PROVIDER_ID] : [];
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : null;
}

/**
 * Live web search through the Lovable connector gateway (Perplexity search).
 * Results are third-party research, never business facts about a customer.
 * Failures are reported, never thrown: not_configured, timeout, rate_limited
 * (with retryAfterSeconds when the gateway sends Retry-After) or unavailable.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchOutcome> {
  const trimmed = query.trim().slice(0, 400);
  if (!trimmed) return { ok: false, reason: "invalid", detail: "Nothing to search for." };
  if (!lovableSearchConfigured())
    return {
      ok: false,
      reason: "not_configured",
      detail: "Web search isn't connected. Link the Perplexity connection in Lovable (LOVABLE_API_KEY and PERPLEXITY_API_KEY).",
    };
  const max = Math.min(Math.max(maxResults, 1), 10);
  let response: Response;
  try {
    response = await fetch(LOVABLE_PERPLEXITY_SEARCH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key("LOVABLE_API_KEY")}`,
        "X-Connection-Api-Key": key("PERPLEXITY_API_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: trimmed, max_results: max }),
      // Workers reject redirect: "error"; a 3xx fails the ok check below.
      redirect: "manual",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError")
      return { ok: false, reason: "timeout", detail: `Web search took longer than ${SEARCH_TIMEOUT_MS / 1000}s, so nothing was found.` };
    console.error("[research] Lovable search request failed", error instanceof Error ? error.message.slice(0, 160) : "failed");
    return { ok: false, reason: "unavailable", detail: "Web search couldn't be reached." };
  }
  if (response.status === 429) {
    const wait = retryAfterSeconds(response);
    return {
      ok: false,
      reason: "rate_limited",
      detail: wait === null ? "Web search is rate limited; try again shortly." : `Web search is rate limited; try again in ${wait}s.`,
      ...(wait === null ? {} : { retryAfterSeconds: wait }),
    };
  }
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 160);
    console.error("[research] Lovable search failed", response.status, body);
    return { ok: false, reason: "unavailable", detail: `Web search failed (${response.status}).` };
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "unavailable", detail: "Web search returned an unreadable answer." };
  }
  const rows = (Array.isArray(payload["results"]) ? payload["results"] : []) as { title?: unknown; url?: unknown; snippet?: unknown; date?: unknown }[];
  const fetchedAt = new Date().toISOString();
  const results = rows
    .filter((r) => typeof r.url === "string" && /^https?:\/\//.test(r.url))
    .slice(0, max)
    .map((r) => ({
      title: String(r.title ?? "").slice(0, 200),
      url: r.url as string,
      snippet: String(r.snippet ?? "").replace(/\s+/g, " ").slice(0, 1_000),
      date: typeof r.date === "string" ? r.date : null,
      source: { url: r.url as string, fetchedAt, provider: SEARCH_PROVIDER_ID, trust: "research" as const },
    }));
  return { ok: true, results };
}
