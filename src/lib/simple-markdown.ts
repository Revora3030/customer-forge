/**
 * A small markdown parser for assistant replies.
 *
 * The bundled markdown renderer can't be built for the Worker target, and
 * replies only need the basics, so this parses them into plain data that the
 * UI turns into React elements. Raw HTML is never interpreted, so model output
 * can't inject markup or scripts; links are kept only for https/mailto/tel.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "code"; lang: string; text: string }
  | { type: "quote"; children: Inline[] }
  | { type: "rule" };

const SAFE_HREF = /^(https:\/\/|mailto:|tel:)/i;

export function parseInline(text: string, depth = 0): Inline[] {
  if (depth > 4) return [{ type: "text", text }];
  const out: Inline[] = [];
  // Asterisks only: underscores appear in code names (jarvis_messages).
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ type: "text", text: text.slice(last, index) });
    const token = match[0];
    if (match[1]) out.push({ type: "code", text: token.slice(1, -1) });
    else if (match[2]) out.push({ type: "strong", children: parseInline(token.slice(2, -2), depth + 1) });
    else if (match[3]) out.push({ type: "em", children: parseInline(token.slice(1, -1), depth + 1) });
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = parseInline(link?.[1] ?? token, depth + 1);
      const href = link?.[2] ?? "";
      out.push(SAFE_HREF.test(href) ? { type: "link", href, children: label } : { type: "text", text: link?.[1] ?? token });
    }
    last = index + token.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      blocks.push({ type: "code", lang: fence[2] ?? "", text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: Math.min(4, heading[1]!.length) as 1 | 2 | 3 | 4, children: parseInline(heading[2]!) });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) body.push((lines[i++] ?? "").replace(/^\s*>\s?/, ""));
      i -= 1;
      blocks.push({ type: "quote", children: parseInline(body.join("\n")) });
      continue;
    }
    const bullet = /^\s*[-*+•]\s+(.*)$/;
    const numbered = /^\s*(\d{1,3})[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      flush();
      const ordered = numbered.test(line);
      const start = ordered ? Number(numbered.exec(line)![1]) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        const item = ordered ? numbered.exec(current) : bullet.exec(current);
        if (item) items.push(ordered ? item[2]! : item[1]!);
        else if (/^\s{2,}\S/.test(current) && items.length) items[items.length - 1] += `\n${current.trim()}`;
        else break;
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "list", ordered, start, items: items.map((item) => parseInline(item)) });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
