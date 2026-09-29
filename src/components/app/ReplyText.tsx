import { Fragment, type ReactNode, useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";

/** Bold (**text**), italic (*text*), strikethrough (~~text~~), inline code (`text`), and auto-links. */
function inline(text: string): ReactNode[] {
  // Split on markdown inline patterns while keeping delimiters
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|~~[^~]+~~|\bhttps?:\/\/[^\s]+)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={index} className="rounded-md bg-muted px-1.5 py-0.5 text-[0.85em] font-mono text-foreground">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**"))
      return <em key={index} className="italic">{part.slice(1, -1)}</em>;
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4)
      return <span key={index} className="line-through opacity-70">{part.slice(2, -2)}</span>;
    if (/^https?:\/\//.test(part)) {
      const href = part.replace(/[.,;!?)]$/, "");
      const display = href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50);
      return (
        <a key={index} href={href} target="_blank" rel="noopener noreferrer"
          className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
          {display}{href.length > 50 ? "…" : ""}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/** A code block with a copy button and language label. */
function CodeBlock({ code, lang }: { code: string; lang?: string | undefined }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [code]);

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-border bg-[#0d1117] dark:bg-[#161b22]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono text-zinc-200">{code}</code>
      </pre>
    </div>
  );
}

/** A formatted table from markdown pipe syntax. */
function Table({ header: headerRow, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {headerRow.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-foreground">
                {inline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-muted-foreground">
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Block =
  | { type: "p"; children: ReactNode[] }
  | { type: "h"; level: number; children: ReactNode[] }
  | { type: "ul"; items: ReactNode[][] }
  | { type: "ol"; items: ReactNode[][] }
  | { type: "code"; code: string; lang?: string | undefined }
  | { type: "quote"; children: ReactNode[] }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] };

/** Parse markdown into structured blocks. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Code block
    if (/^```/.test(trimmed)) {
      const lang = trimmed.replace(/^```/, "").trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", code: codeLines.join("\n"), lang: lang || undefined });
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      blocks.push({ type: "h", level: headingMatch[1]!.length, children: inline(headingMatch[2]!) });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s/.test(lines[i]!.trim())) {
        quoteLines.push(lines[i]!.trim().replace(/^>\s/, ""));
        i++;
      }
      blocks.push({ type: "quote", children: inline(quoteLines.join(" ")) });
      continue;
    }

    // Table (pipe syntax)
    if (trimmed.includes("|") && i + 1 < lines.length && /^\|?[\s-:|]+\|?$/.test(lines[i + 1]!.trim())) {
      const parseRow = (s: string) => s.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = parseRow(trimmed);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().includes("|")) {
        rows.push(parseRow(lines[i]!.trim()));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: ReactNode[][] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i]!.trim())) {
        items.push(inline(lines[i]!.trim().replace(/^\d+[.)]\s+/, "")));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Unordered list
    if (/^\s*[-*•]\s+/.test(trimmed)) {
      const items: ReactNode[][] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i]!.trim())) {
        items.push(inline(lines[i]!.trim().replace(/^\s*[-*•]\s+/, "")));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Empty line - skip
    if (!trimmed) {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^```/.test(lines[i]!.trim()) &&
      !/^#{1,6}\s/.test(lines[i]!.trim()) &&
      !/^>\s/.test(lines[i]!.trim()) &&
      !/^\d+[.)]\s+/.test(lines[i]!.trim()) &&
      !/^\s*[-*•]\s+/.test(lines[i]!.trim()) &&
      !/^---+$/.test(lines[i]!.trim())
    ) {
      paraLines.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ type: "p", children: inline(paraLines.join(" ")) });
  }

  return blocks;
}

const headingClass = (level: number) => {
  switch (level) {
    case 1: return "text-xl font-bold mt-4 mb-2";
    case 2: return "text-lg font-bold mt-3.5 mb-2";
    case 3: return "text-base font-semibold mt-3 mb-1.5";
    case 4: return "text-sm font-semibold mt-2.5 mb-1";
    default: return "text-sm font-semibold mt-2 mb-1";
  }
};

/**
 * Renders an AI reply with full markdown: headings, bold/italic/strike, inline code,
 * code blocks with copy buttons, tables, blockquotes, ordered/unordered lists,
 * horizontal rules, and auto-linked URLs. No HTML from the reply ever reaches the page.
 */
export function ReplyText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "p":
            return <p key={index} className="my-1.5 leading-relaxed">{block.children}</p>;
          case "h": {
            const Tag = `h${Math.min(block.level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            return <Tag key={index} className={headingClass(block.level)}>{block.children}</Tag>;
          }
          case "ul":
            return (
              <ul key={index} className="my-2 list-disc space-y-1 pl-5 leading-relaxed">
                {block.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={index} className="my-2 list-decimal space-y-1 pl-5 leading-relaxed">
                {block.items.map((item, i) => <li key={i}>{item}</li>)}
              </ol>
            );
          case "code":
            return <CodeBlock key={index} code={block.code} lang={block.lang ?? undefined} />;
          case "quote":
            return (
              <blockquote key={index} className="my-2 border-l-3 border-primary/40 bg-primary/5 py-2 pl-4 pr-2 text-muted-foreground italic">
                {block.children}
              </blockquote>
            );
          case "hr":
            return <hr key={index} className="my-3 border-border" />;
          case "table":
            return <Table key={index} header={block.header} rows={block.rows} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
