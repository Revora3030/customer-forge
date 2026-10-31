import { Fragment, type ReactNode } from "react";

/**
 * Renders the small Markdown subset the SEO content files use: `##`/`###`
 * headings, paragraphs, bullet / numbered / checklist items (with nesting),
 * pipe tables, bold, and links. Everything is rendered as React nodes, so
 * nothing in a content file can inject HTML.
 */

type LinkCheck = (href: string) => boolean;

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+[^\s).,;:!?])/g;

function inline(text: string, isLive: LinkCheck, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyBase}-${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {inline(m[1], isLive, key)}
        </strong>,
      );
    } else if (m[2] !== undefined && m[3] !== undefined) {
      out.push(link(m[2], m[3], isLive, key));
    } else if (m[4] !== undefined) {
      out.push(link(m[4], m[4], isLive, key));
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function link(label: string, href: string, isLive: LinkCheck, key: string): ReactNode {
  const external = /^https?:\/\//.test(href);
  // A link to a page that is not live yet reads as plain text instead of a dead end.
  if (!external && !isLive(href)) return <Fragment key={key}>{label}</Fragment>;
  return (
    <a
      key={key}
      href={href}
      className="text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary"
      {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
    >
      {label}
    </a>
  );
}

interface ListItem {
  text: string;
  checked: boolean | null;
  children: ListNode | null;
}
interface ListNode {
  ordered: boolean;
  items: ListItem[];
}

type Block =
  | { type: "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; list: ListNode }
  | { type: "table"; head: string[]; rows: string[][] };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const LIST_LINE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function buildList(lines: string[]): ListNode {
  const first = LIST_LINE.exec(lines[0] ?? "");
  const root: ListNode = { ordered: /\d+\./.test(first?.[2] ?? ""), items: [] };
  const stack: { indent: number; list: ListNode }[] = [{ indent: (first?.[1] ?? "").length, list: root }];
  let last: ListItem | null = null;
  for (const line of lines) {
    const m = LIST_LINE.exec(line);
    if (!m) {
      // Continuation of the previous item.
      if (last) last.text += ` ${line.trim()}`;
      continue;
    }
    const indent = (m[1] ?? "").length;
    while (stack.length > 1 && indent < stack[stack.length - 1]!.indent) stack.pop();
    if (indent > stack[stack.length - 1]!.indent && last) {
      const child: ListNode = { ordered: /\d+\./.test(m[2] ?? ""), items: [] };
      last.children = child;
      stack.push({ indent, list: child });
    }
    const task = /^\[( |x)\]\s+(.*)$/.exec(m[3] ?? "");
    const item: ListItem = {
      text: task ? (task[2] ?? "") : (m[3] ?? ""),
      checked: task ? task[1] === "x" : null,
      children: null,
    };
    stack[stack.length - 1]!.list.items.push(item);
    last = item;
  }
  return root;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    const h = /^(##|###)\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: h[1] === "##" ? "h2" : "h3", text: h[2] ?? "" });
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flushPara();
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(splitRow(lines[i] ?? ""));
        i++;
      }
      i--;
      blocks.push({ type: "table", head, rows });
      continue;
    }
    if (LIST_LINE.test(line)) {
      flushPara();
      const group: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (l.trim() === "") {
          // A blank line continues the list only when another item follows.
          if (LIST_LINE.test(lines[i + 1] ?? "")) {
            i++;
            continue;
          }
          break;
        }
        if (!LIST_LINE.test(l) && !/^\s+\S/.test(l)) break;
        group.push(l);
        i++;
      }
      i--;
      blocks.push({ type: "list", list: buildList(group) });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

function renderList(list: ListNode, isLive: LinkCheck, key: string): ReactNode {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag
      key={key}
      className={`mt-3 space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground ${
        list.ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {list.items.map((item, idx) => (
        <li key={`${key}-${idx}`} className={item.checked !== null ? "list-none -ml-5" : undefined}>
          {item.checked !== null ? (
            <span aria-hidden className="mr-2 inline-block">
              {item.checked ? "☑" : "☐"}
            </span>
          ) : null}
          {inline(item.text, isLive, `${key}-${idx}`)}
          {item.children && item.children.items.length > 0
            ? renderList(item.children, isLive, `${key}-${idx}-c`)
            : null}
        </li>
      ))}
    </Tag>
  );
}

export function SeoMarkdown({
  source,
  isLive = () => true,
}: {
  source: string;
  /** Returns false for an internal link whose page is not published yet. */
  isLive?: LinkCheck;
}) {
  const blocks = parseBlocks(source);
  return (
    <div className="seo-markdown">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "h2":
            return (
              <h2 key={key} className="mt-10 font-display text-[19px] font-semibold">
                {inline(block.text, isLive, key)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={key} className="mt-6 font-display text-[16px] font-semibold">
                {inline(block.text, isLive, key)}
              </h3>
            );
          case "p":
            return (
              <p key={key} className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                {inline(block.text, isLive, key)}
              </p>
            );
          case "list":
            return renderList(block.list, isLive, key);
          case "table":
            return (
              <div
                key={key}
                tabIndex={0}
                role="region"
                aria-label="Comparison table"
                className="mt-6 overflow-x-auto rounded-2xl border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[560px] text-left text-[14px]">
                  <thead className="bg-card/60 text-[13px]">
                    <tr>
                      {block.head.map((cell, c) => (
                        <th key={`${key}-h${c}`} scope="col" className="px-4 py-3 font-semibold">
                          {cell === "" ? <span className="sr-only">Factor</span> : inline(cell, isLive, `${key}-h${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r${r}`} className="border-t border-border/50 align-top">
                        {row.map((cell, c) =>
                          c === 0 ? (
                            <th key={`${key}-r${r}c${c}`} scope="row" className="px-4 py-3 font-medium">
                              {inline(cell, isLive, `${key}-r${r}c${c}`)}
                            </th>
                          ) : (
                            <td key={`${key}-r${r}c${c}`} className="px-4 py-3 text-muted-foreground">
                              {inline(cell, isLive, `${key}-r${r}c${c}`)}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
