import { Fragment, type ReactNode } from "react";

/** Bold (**text**) and inline code (`text`) inside one line, as plain React nodes. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={index} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/**
 * Shows an AI reply with its lists and bold text formatted. Only text is
 * rendered — no HTML from the reply ever reaches the page.
 */
export function ReplyText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="my-1.5 list-decimal space-y-0.5 pl-5">{items}</ol>
      ) : (
        <ul key={blocks.length} className="my-1.5 list-disc space-y-0.5 pl-5">{items}</ul>
      ),
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length} className="my-1.5">{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className={className}>{blocks}</div>;
}
