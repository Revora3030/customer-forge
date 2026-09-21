import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import type { PrivateMetaResult } from "@/lib/app-meta";

/**
 * Shows the exact head metadata crawlers read for this route, plus a live
 * read of the rendered <head> so drift between code and DOM is visible.
 */
export function MetaPreview({ meta, label }: { meta: PrivateMetaResult; label: string }) {
  const [live, setLive] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const read: Record<string, string> = {};
    read["title"] = document.title;
    document.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]").forEach((el) => {
      const key = el.getAttribute("name") ?? el.getAttribute("property");
      if (key) read[key] = el.content;
    });
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) read["canonical"] = canonical.href;
    setLive(read);
  }, []);

  const rows = useMemo(
    () => [
      { label: "Title", value: meta.resolved.title, live: live?.["title"] },
      { label: "Description", value: meta.resolved.description, live: live?.["description"] },
      { label: "Canonical", value: meta.resolved.canonical, live: live?.["canonical"] },
      { label: "Robots", value: meta.resolved.robots, live: live?.["robots"] },
      { label: "og:title", value: meta.resolved.ogTitle, live: live?.["og:title"] },
      {
        label: "og:description",
        value: meta.resolved.ogDescription,
        live: live?.["og:description"],
      },
      { label: "og:url", value: meta.resolved.ogUrl, live: live?.["og:url"] },
      { label: "og:type", value: meta.resolved.ogType, live: live?.["og:type"] },
      { label: "og:site_name", value: meta.resolved.ogSiteName, live: live?.["og:site_name"] },
      { label: "twitter:card", value: meta.resolved.twitterCard, live: live?.["twitter:card"] },
      { label: "twitter:title", value: meta.resolved.twitterTitle, live: live?.["twitter:title"] },
      {
        label: "twitter:description",
        value: meta.resolved.twitterDescription,
        live: live?.["twitter:description"],
      },
      {
        label: "og:image",
        value: meta.resolved.image ?? "— none (host supplies preview)",
        live: live?.["og:image"],
      },
    ],
    [live, meta],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(meta.resolved, null, 2));
      toast.success("Metadata copied");
    } catch {
      toast.error("Could not copy metadata");
    }
  };

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <Search className="h-4 w-4 text-primary" aria-hidden />
            Search &amp; social preview
          </h3>
          <p className="text-sm text-muted-foreground">
            Exactly what crawlers read for <span className="font-mono">{label}</span>. This page is
            private, so it stays out of search results.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="mr-2 h-4 w-4" aria-hidden />
          Copy values
        </Button>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/60 p-4">
        <p className="truncate text-xs text-muted-foreground">{meta.resolved.canonical}</p>
        <p className="mt-1 line-clamp-1 font-display text-base font-semibold text-primary">
          {meta.resolved.title}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {meta.resolved.description}
        </p>
      </div>

      <dl className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
        {rows.map((row) => {
          const matches = row.live === undefined || row.live === row.value;
          return (
            <div key={row.label} className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="flex items-start gap-2 break-words text-sm">
                <span className="flex-1">{row.value}</span>
                {matches ? (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-label="Matches rendered head"
                  />
                ) : (
                  <span className="shrink-0 text-xs text-destructive">
                    rendered: {row.live || "missing"}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}
