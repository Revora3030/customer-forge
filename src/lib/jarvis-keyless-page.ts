import { parseDocument } from "htmlparser2";
import { findAll, getText, isTag } from "domutils";

export const KEYLESS_PAGE_TOOLS = ["website.html.audit", "website.accessibility.static", "website.security.headers", "website.links.inventory"] as const;
export type KeylessPageTool = typeof KEYLESS_PAGE_TOOLS[number];
export const MAX_HTML_BYTES = 200_000;

/** No scripts, cookies, redirects, subresources, credentials or raw HTML are returned. */
export async function readKeylessPage(url: string) {
  const response = await fetch(url, {
    redirect: "manual",
    credentials: "omit",
    headers: { Accept: "text/html", "User-Agent": "Revora-ReadOnly-Page-Check" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) { await response.body?.cancel(); return { reason: "page_http_status", httpStatus: response.status } as const; }
  if (!/\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    return { reason: "not_html", httpStatus: response.status } as const;
  }
  const reader = response.body?.getReader();
  if (!reader) return { reason: "empty_response", httpStatus: response.status } as const;
  let bytes = 0;
  let html = "";
  let truncated = false;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const remaining = MAX_HTML_BYTES - bytes;
      if (part.value.byteLength > remaining) { truncated = true; break; }
      bytes += part.value.byteLength;
      html += decoder.decode(part.value, { stream: true });
    }
    html += decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (truncated) return { reason: "html_limit_exceeded", httpStatus: response.status, inspectedBytes: bytes } as const;
  return { html, headers: response.headers, httpStatus: response.status, inspectedBytes: bytes } as const;
}

export function analyzeKeylessPage(html: string, url: string, headers = new Headers()) {
  const document = parseDocument(html);
  const elements = findAll(isTag, document.children);
  const tags = (name: string) => elements.filter((element) => element.name === name);
  const issues: string[] = [];
  const add = (condition: boolean, code: string) => { if (condition) issues.push(code); };
  const metas = tags("meta");
  const meta = (name: string) => metas.find((e) => e.attribs["name"]?.toLowerCase() === name)?.attribs["content"]?.trim();
  const property = (name: string) => metas.find((e) => e.attribs["property"]?.toLowerCase() === name)?.attribs["content"]?.trim();
  const title = getText(tags("title")[0] ?? []).trim();
  const canonical = tags("link").find((e) => e.attribs["rel"]?.toLowerCase() === "canonical")?.attribs["href"];
  let canonicalValid = false;
  try { const parsed = new URL(canonical ?? ""); canonicalValid = parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { /* missing or relative canonical */ }
  add(!title, "missing_title");
  add(!meta("description"), "missing_description");
  add(!canonicalValid, "missing_or_invalid_canonical");
  add(!meta("viewport"), "missing_viewport");
  add(!property("og:title") || !property("og:description"), "missing_social_metadata");
  const noindex = /(?:^|[\s,])noindex(?:$|[\s,])/i.test(`${meta("robots") ?? ""},${headers.get("x-robots-tag") ?? ""}`);
  add(noindex, "page_not_indexable");
  const seo = { titlePresent: Boolean(title), descriptionPresent: Boolean(meta("description")), canonicalValid, viewportPresent: Boolean(meta("viewport")), noindex, issues: [...issues] };
  issues.length = 0;
  const ids = new Set<string>();
  let duplicateIds = 0;
  for (const element of elements) { const id = element.attribs["id"]; if (id) { if (ids.has(id)) duplicateIds++; ids.add(id); } }
  const textOf = (e: typeof elements[number]) => getText(e).trim();
  const nameOf = (e: typeof elements[number]): boolean => {
    if (e.attribs["aria-label"]?.trim() || e.attribs["title"]?.trim()) return true;
    const references = e.attribs["aria-labelledby"]?.trim().split(/\s+/) ?? [];
    return references.length > 0 && references.every((id) => elements.some((node) => node.attribs["id"] === id && Boolean(textOf(node))));
  };
  const imagesMissingAlt = tags("img").filter((e) => !("alt" in e.attribs)).length;
  const labels = tags("label");
  const controls = elements.filter((e) => ["input", "select", "textarea"].includes(e.name) && !["hidden", "submit", "button", "reset", "image"].includes(e.attribs["type"] ?? ""));
  const unlabeledControls = controls.filter((e) => {
    if (nameOf(e)) return false;
    if (e.attribs["id"] && labels.some((label) => label.attribs["for"] === e.attribs["id"] && Boolean(textOf(label)))) return false;
    let parent = e.parent;
    while (parent) { if (isTag(parent) && parent.name === "label" && Boolean(getText(parent).trim())) return false; parent = parent.parent; }
    return true;
  }).length;
  const namelessButtons = tags("button").filter((e) => !nameOf(e) && !textOf(e) && !findAll(isTag, e.children).some((child) => child.name === "img" && Boolean(child.attribs["alt"]?.trim()))).length;
  let headingSkips = 0;
  let previous = 0;
  for (const e of elements.filter((node) => /^h[1-6]$/.test(node.name))) { const level = Number(e.name[1]); if (previous && level > previous + 1) headingSkips++; previous = level; }
  add(!tags("html")[0]?.attribs["lang"]?.trim(), "missing_document_language");
  add(imagesMissingAlt > 0, "images_missing_alt"); add(unlabeledControls > 0, "unlabeled_form_controls");
  add(namelessButtons > 0, "buttons_missing_names"); add(duplicateIds > 0, "duplicate_ids"); add(headingSkips > 0, "heading_level_skips");
  const scripts = tags("script").filter((e) => e.attribs["type"]?.toLowerCase() === "application/ld+json");
  let invalidStructuredData = 0;
  for (const script of scripts) { try { const value: unknown = JSON.parse(getText(script)); if (!value || typeof value !== "object") invalidStructuredData++; } catch { invalidStructuredData++; } }
  add(invalidStructuredData > 0, "invalid_structured_data_json");
  const accessibility = { imagesMissingAlt, unlabeledControls, namelessButtons, duplicateIds, headingSkips, structuredDataBlocks: scripts.length, invalidStructuredData, issues: [...issues] };
  issues.length = 0;
  let sameSite = 0, external = 0, contact = 0, unsafe = 0, brokenFragments = 0;
  let base = url;
  try { base = new URL(tags("base")[0]?.attribs["href"] ?? url, url).href; } catch { /* use page URL */ }
  for (const anchor of tags("a")) {
    const href = anchor.attribs["href"];
    if (href === undefined) continue;
    try {
      const resolved = new URL(href, base);
      if (["mailto:", "tel:"].includes(resolved.protocol)) { contact++; continue; }
      if (!["https:", "http:"].includes(resolved.protocol) || resolved.username || resolved.password) { unsafe++; continue; }
      if (resolved.origin !== new URL(url).origin) { external++; continue; }
      sameSite++;
      if (resolved.pathname === new URL(url).pathname && resolved.search === new URL(url).search && resolved.hash && !ids.has(decodeURIComponent(resolved.hash.slice(1)))) brokenFragments++;
    } catch { unsafe++; }
  }
  add(unsafe > 0, "unsafe_or_invalid_link_targets"); add(brokenFragments > 0, "missing_same_page_anchors");
  const links = { sameSite, external, contact, unsafe, brokenFragments, destinationsFetched: 0, issues: [...issues] };
  issues.length = 0;
  const hsts = /max-age\s*=\s*[1-9]\d*/i.test(headers.get("strict-transport-security") ?? "");
  const nosniff = headers.get("x-content-type-options")?.toLowerCase() === "nosniff";
  const csp = Boolean(headers.get("content-security-policy")?.trim());
  const framing = /(?:^|;)\s*frame-ancestors\s/i.test(headers.get("content-security-policy") ?? "") || /^(deny|sameorigin)$/i.test(headers.get("x-frame-options") ?? "");
  add(!hsts, "hsts_not_detected"); add(!nosniff, "nosniff_not_detected"); add(!csp, "csp_not_detected");
  const security = { hsts, nosniff, csp, framingPolicyPresent: framing, referrerPolicyPresent: Boolean(headers.get("referrer-policy")), issues: [...issues] };
  return { seo, accessibility, links, security };
}