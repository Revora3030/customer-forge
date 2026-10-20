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
  | { ok: false; reason: string; detail: string };

type SearchProvider = {
  id: "perplexity" | "tavily" | "brave" | "exa" | "jina";
  configured: () => boolean;
  run: (query: string, max: number, signal: AbortSignal) => Promise<{ title?: unknown; url?: unknown; snippet?: unknown; date?: unknown }[]>;
};

const key = (...names: string[]) => names.map((name) => process.env[name]?.trim()).find(Boolean) ?? null;

async function json(response: Response, provider: string) {
  if (!response.ok) throw new Error(`${provider}_${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Search providers in order. Each is used only when its own key is set; the
 * first one that answers wins. Every request uses redirect: "manual" (Workers
 * reject "error"), and a 3xx fails the ok check.
 */
const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    id: "perplexity",
    configured: () => Boolean(key("LOVABLE_API_KEY") && key("PERPLEXITY_API_KEY")),
    run: async (query, max, signal) => {
      const payload = await json(
        await fetch("https://connector-gateway.lovable.dev/perplexity/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${key("LOVABLE_API_KEY")}`, "X-Connection-Api-Key": key("PERPLEXITY_API_KEY")!, "Content-Type": "application/json" },
          body: JSON.stringify({ query, max_results: max }),
          redirect: "manual",
          signal,
        }),
        "perplexity",
      );
      return (payload["results"] as Record<string, unknown>[] | undefined) ?? [];
    },
  },
  {
    id: "tavily",
    configured: () => Boolean(key("TAVILY_API_KEY")),
    run: async (query, max, signal) => {
      const payload = await json(
        await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${key("TAVILY_API_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, max_results: max, search_depth: "basic" }),
          redirect: "manual",
          signal,
        }),
        "tavily",
      );
      return ((payload["results"] as Record<string, unknown>[] | undefined) ?? []).map((r) => ({ title: r["title"], url: r["url"], snippet: r["content"], date: r["published_date"] }));
    },
  },
  {
    id: "brave",
    configured: () => Boolean(key("BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY")),
    run: async (query, max, signal) => {
      const payload = await json(
        await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
          headers: { Accept: "application/json", "X-Subscription-Token": key("BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY")! },
          redirect: "manual",
          signal,
        }),
        "brave",
      );
      const web = payload["web"] as { results?: Record<string, unknown>[] } | undefined;
      return (web?.results ?? []).map((r) => ({ title: r["title"], url: r["url"], snippet: r["description"], date: r["page_age"] ?? r["age"] }));
    },
  },
  {
    id: "exa",
    configured: () => Boolean(key("EXA_API_KEY")),
    run: async (query, max, signal) => {
      const payload = await json(
        await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "x-api-key": key("EXA_API_KEY")!, "Content-Type": "application/json" },
          body: JSON.stringify({ query, numResults: max, contents: { text: { maxCharacters: 600 } } }),
          redirect: "manual",
          signal,
        }),
        "exa",
      );
      return ((payload["results"] as Record<string, unknown>[] | undefined) ?? []).map((r) => ({ title: r["title"], url: r["url"], snippet: r["text"], date: r["publishedDate"] }));
    },
  },
  {
    id: "jina",
    configured: () => Boolean(key("JINA_API_KEY")),
    run: async (query, max, signal) => {
      const payload = await json(
        await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${key("JINA_API_KEY")}`, Accept: "application/json", "X-Respond-With": "no-content" },
          redirect: "manual",
          signal,
        }),
        "jina",
      );
      return ((payload["data"] as Record<string, unknown>[] | undefined) ?? []).slice(0, max).map((r) => ({ title: r["title"], url: r["url"], snippet: r["description"] ?? r["content"], date: r["date"] }));
    },
  },
];

/** Search providers with a key set, in the order they are tried. */
export function configuredSearchProviders(): string[] {
  return SEARCH_PROVIDERS.filter((provider) => provider.configured()).map((provider) => provider.id);
}

/**
 * Live web search. Tries Perplexity (Lovable connector), then Tavily, Brave,
 * Exa and Jina, each only when its key is set; the first that answers wins.
 * Results are third-party research, never business facts about a customer.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchOutcome> {
  const trimmed = query.trim().slice(0, 400);
  if (!trimmed) return { ok: false, reason: "invalid", detail: "Nothing to search for." };
  const providers = SEARCH_PROVIDERS.filter((provider) => provider.configured());
  if (!providers.length) return { ok: false, reason: "not_configured", detail: "Web search isn't connected." };
  const max = Math.min(Math.max(maxResults, 1), 10);
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const rows = await provider.run(trimmed, max, AbortSignal.timeout(15_000));
      const fetchedAt = new Date().toISOString();
      const results = rows
        .filter((r) => typeof r.url === "string" && /^https?:\/\//.test(r.url))
        .slice(0, max)
        .map((r) => ({
          title: String(r.title ?? "").slice(0, 200),
          url: r.url as string,
          snippet: String(r.snippet ?? "").replace(/\s+/g, " ").slice(0, 1_000),
          date: typeof r.date === "string" ? r.date : null,
          source: { url: r.url as string, fetchedAt, provider: provider.id, trust: "research" as const },
        }));
      return { ok: true, results };
    } catch (error) {
      failures.push(`${provider.id}: ${error instanceof Error ? error.message.slice(0, 160) : "failed"}`);
    }
  }
  console.error("[research] every search provider failed", failures.join(" | "));
  return { ok: false, reason: "unavailable", detail: failures.join("; ").slice(0, 300) };
}
