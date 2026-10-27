/**
 * Content health of a published customer page, read from its served HTML.
 * Regex scanning keeps this runnable on the edge worker with no HTML parser;
 * every finding is a plain measurement of the markup, not an opinion.
 */
export type AuditFinding = { check: "title" | "description" | "h1" | "json-ld" | "image-alt" | "broken-link"; severity: "P1" | "P2"; detail: string };

export const MAX_AUDIT_HTML_CHARS = 500_000;

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
  return attrs;
}

export type PageAudit = { findings: AuditFinding[]; internalLinks: string[] };

export function auditHtml(html: string, pageUrl: string): PageAudit {
  const text = html.slice(0, MAX_AUDIT_HTML_CHARS);
  const findings: AuditFinding[] = [];

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.replace(/\s+/g, " ").trim();
  if (!title) findings.push({ check: "title", severity: "P1", detail: "no <title>" });

  const description = [...text.matchAll(/<meta\b[^>]*>/gi)].map((m) => attributes(m[0])).find((a) => a["name"]?.toLowerCase() === "description");
  if (!description?.["content"]?.trim()) findings.push({ check: "description", severity: "P2", detail: "no meta description" });

  const h1 = (text.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) findings.push({ check: "h1", severity: "P1", detail: `${h1} h1 elements` });

  let badLd = 0;
  for (const block of text.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]!); } catch { badLd += 1; }
  }
  if (badLd) findings.push({ check: "json-ld", severity: "P1", detail: `${badLd} structured-data block${badLd === 1 ? "" : "s"} are not valid JSON` });

  const noAlt = [...text.matchAll(/<img\b[^>]*>/gi)].filter((m) => !("alt" in attributes(m[0]))).length;
  if (noAlt) findings.push({ check: "image-alt", severity: "P2", detail: `${noAlt} image${noAlt === 1 ? "" : "s"} without an alt attribute` });

  const origin = new URL(pageUrl).origin;
  const links = new Set<string>();
  for (const match of text.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(match[0])["href"]?.trim();
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const url = new URL(href, pageUrl);
      if (url.origin === origin) { url.hash = ""; links.add(url.toString()); }
    } catch { /* malformed href */ }
  }
  links.delete(new URL(pageUrl).toString());
  return { findings, internalLinks: [...links] };
}
