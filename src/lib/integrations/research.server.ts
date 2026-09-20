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

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);

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
