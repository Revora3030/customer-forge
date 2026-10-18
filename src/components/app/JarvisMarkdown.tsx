import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { parseMarkdown, type Inline } from "@/lib/simple-markdown";

function renderInline(nodes: Inline[], key: string): ReactNode[] {
  return nodes.map((node, index) => {
    const k = `${key}.${index}`;
    switch (node.type) {
      case "text":
        return <span key={k}>{node.text}</span>;
      case "strong":
        return <strong key={k} className="font-semibold">{renderInline(node.children, k)}</strong>;
      case "em":
        return <em key={k}>{renderInline(node.children, k)}</em>;
      case "code":
        return <code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{node.text}</code>;
      case "link":
        return (
          <a key={k} href={node.href} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline underline-offset-2">
            {renderInline(node.children, k)}
          </a>
        );
    }
  });
}

/** A fenced code block: a header with its language and a copy button, then text that scrolls sideways. */
function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/60">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border/70 pl-3 pr-1 text-xs text-muted-foreground">
        <span className="truncate font-mono">{lang || "code"}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={() => { void copy(); }}
          className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 font-mono text-[13px] leading-snug">
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** Renders a Jarvis reply's markdown as React elements; raw HTML is never interpreted. */
export const JarvisMarkdown = memo(function JarvisMarkdown({ children }: { children: string }) {
  const blocks = parseMarkdown(children);
  return (
    <div className="min-w-0 space-y-3 break-words leading-relaxed">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "heading": {
            const size = block.level === 1 ? "text-lg" : block.level === 2 ? "text-base" : "text-sm";
            return <p key={key} role="heading" aria-level={block.level + 1} className={`${size} pt-1 font-semibold`}>{renderInline(block.children, key)}</p>;
          }
          case "paragraph":
            return <p key={key} className="whitespace-pre-line">{renderInline(block.children, key)}</p>;
          case "list": {
            const items = block.items.map((item, i) => <li key={`${key}.${i}`} className="whitespace-pre-line pl-0.5">{renderInline(item, `${key}.${i}`)}</li>);
            return block.ordered ? (
              <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">{items}</ol>
            ) : (
              <ul key={key} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">{items}</ul>
            );
          }
          case "code":
            return <CodeBlock key={key} lang={block.lang} text={block.text} />;
          case "quote":
            return <blockquote key={key} className="whitespace-pre-line border-l-2 border-primary/50 pl-3 text-muted-foreground">{renderInline(block.children, key)}</blockquote>;
          case "rule":
            return <hr key={key} className="border-border" />;
        }
      })}
    </div>
  );
});
