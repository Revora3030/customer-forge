import { ExternalLink, Globe } from "lucide-react";
import type { ResearchResultRecord } from "./research-results";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** One approved Perplexity Agent answer, with its sources shown. */
export function ResearchResultCard({ result }: { result: ResearchResultRecord }) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Globe className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 break-words">Research: {result.question}</span>
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{result.text}</p>
      {result.citations.length ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">Citations</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {result.citations.map((url) => (
              <li key={url} className="text-xs">
                <a className="inline-flex min-w-0 items-center gap-1 break-all underline" href={url} target="_blank" rel="noreferrer">
                  {host(url)} <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {result.searchResults.length ? (
        <details className="mt-2 rounded-md border border-border bg-background/60">
          <summary className="flex min-h-10 cursor-pointer items-center px-2 text-xs">
            {result.searchResults.length} source{result.searchResults.length === 1 ? "" : "s"} searched
          </summary>
          <ul className="space-y-1 border-t border-border p-2">
            {result.searchResults.map((source) => (
              <li key={source.url} className="text-xs">
                <a className="break-all underline" href={source.url} target="_blank" rel="noreferrer">
                  {source.title ?? host(source.url)}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Third-party research{result.model ? ` via ${result.model}` : ""}, not a verified business fact. Paid from your Perplexity credits with your one-tap approval.
      </p>
    </div>
  );
}
