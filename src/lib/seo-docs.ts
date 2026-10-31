/**
 * Long-form SEO pages (comparisons, guides, posts, local pages) are written as
 * Markdown files under `src/content/seo/`. This module loads them at build
 * time, reads the YAML-style frontmatter, strips anything that is not for
 * publishing and extracts the visible FAQ so the FAQPage structured data can
 * only ever contain text that the page actually shows.
 */

export type SeoDocKind = "compare" | "guide" | "post" | "local";

export interface SeoFaq {
  q: string;
  a: string;
}

export interface SeoDoc {
  kind: SeoDocKind;
  /** File name without extension, e.g. `revora-vs-wix` or `index`. */
  file: string;
  /** Last URL segment, e.g. `revora-vs-wix`. */
  slug: string;
  /** Public path, e.g. `/compare/revora-vs-wix`. */
  path: string;
  /** Search-facing `<title>`. */
  title: string;
  description: string;
  h1: string;
  /** Page body as Markdown: no frontmatter, no H1, no internal notes. */
  body: string;
  faqs: readonly SeoFaq[];
  words: number;
  /** ISO timestamp the page goes live, or null when it is live already. */
  publishAt: string | null;
}

/** Removes Markdown emphasis and link syntax, leaving the text a visitor reads. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const NOTES_MARKER = /\n---[ \t]*\n+\*\*Notes \(not for publishing\)[\s\S]*$/;

export function parseFrontmatter(raw: string): { meta: Record<string, string>; rest: string } {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { meta: {}, rest: text };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, rest: text };
  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([a-z0-9_]+)(?: \(\d+ chars\))?:\s*(.*)$/.exec(line);
    if (m && m[1] && m[2] !== undefined) meta[m[1]] = m[2].trim();
  }
  return { meta, rest: text.slice(end + 5) };
}

/** Pulls `**Question?** answer` pairs out of the page's questions section. */
export function extractFaqs(body: string): SeoFaq[] {
  const lines = body.split("\n");
  const faqs: SeoFaq[] = [];
  let inSection = false;
  let current: { q: string; a: string[] } | null = null;
  const flush = () => {
    if (current && current.a.length > 0) {
      faqs.push({ q: plainText(current.q), a: plainText(current.a.join(" ")) });
    }
    current = null;
  };
  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      inSection = /questions|faq/i.test(heading[1] ?? "");
      continue;
    }
    if (!inSection) continue;
    const q = /^\*\*([^*]+\?)\*\*\s*(.*)$/.exec(line);
    if (q) {
      flush();
      current = { q: q[1] ?? "", a: q[2] ? [q[2]] : [] };
      continue;
    }
    if (line.trim() === "") {
      if (current && current.a.length > 0) flush();
      continue;
    }
    if (/^\*\*/.test(line)) {
      flush();
      continue;
    }
    if (current) current.a.push(line.trim());
  }
  flush();
  return faqs;
}

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** `Mon Nov 9, 2026` → midnight Eastern on that day (every target date falls after the Nov 1 DST change). */
export function publishAtFromTarget(target: string | undefined): string | null {
  if (!target) return null;
  const m = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(target);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months.indexOf(m[1] ?? "") + 1;
  if (month === 0) return null;
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return `${m[3]}-${pad(month)}-${pad(m[2] ?? "1")}T00:00:00-05:00`;
}

export function parseSeoDoc(kind: SeoDocKind, file: string, raw: string): SeoDoc {
  const { meta, rest } = parseFrontmatter(raw);
  const body = rest
    .replace(NOTES_MARKER, "")
    .replace(/^\s*#\s+[^\n]*\n/, "")
    .trim();
  const path = meta["url"] ?? "";
  const h1 = meta["h1"] ?? "";
  return {
    kind,
    file,
    slug: path.split("/").filter(Boolean).pop() ?? file,
    path,
    title: meta["title_tag"] ?? "",
    description: meta["meta_description"] ?? "",
    h1,
    body,
    faqs: extractFaqs(body),
    words: countWords(plainText(body)),
    publishAt: publishAtFromTarget(meta["publish_date_target"]),
  };
}

function load(kind: SeoDocKind, files: Record<string, string>): SeoDoc[] {
  return Object.entries(files)
    .map(([key, raw]) => {
      const file = key.split("/").pop()!.replace(/\.md$/, "");
      return parseSeoDoc(kind, file, raw);
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

const COMPARE_FILES = import.meta.glob("../content/seo/compare/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const COMPARE_DOCS: readonly SeoDoc[] = load("compare", COMPARE_FILES);

export function isLive(doc: Pick<SeoDoc, "publishAt">, now: Date = new Date()): boolean {
  return doc.publishAt === null || now.getTime() >= Date.parse(doc.publishAt);
}
