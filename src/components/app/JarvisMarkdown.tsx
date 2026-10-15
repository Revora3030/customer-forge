import { memo, type ReactNode } from "react";
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
            const items = block.items.map((item, i) => <li key={`${key}.${i}`} className="whitespace-pre-line pl-1">{renderInline(item, `${key}.${i}`)}</li>);
            return block.ordered ? (
              <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5">{items}</ol>
            ) : (
              <ul key={key} className="list-disc space-y-1 pl-5">{items}</ul>
            );
          }
          case "code":
            return (
              <pre key={key} className="max-w-full overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[12px] leading-snug">
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return <blockquote key={key} className="whitespace-pre-line border-l-2 border-primary/50 pl-3 text-muted-foreground">{renderInline(block.children, key)}</blockquote>;
          case "rule":
            return <hr key={key} className="border-border" />;
        }
      })}
    </div>
  );
});
