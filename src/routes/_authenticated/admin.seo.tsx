/**
 * Search growth: what to work on next, from real data only.
 *
 * Two honest sources: the technical audit of every page Revora publishes
 * (computed here, always current), and your own Search Console performance
 * export, which turns into a ranked work list. Nothing is estimated and no
 * ranking is ever promised.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { EmptyState, MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { GoogleLocalListing, GoogleSearchGrowth } from "@/components/app/GoogleSearchGrowth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { seoAuditSummary } from "@/lib/seo-audit";
import { consoleCoverage, parseConsoleRows, seoOpportunities } from "@/lib/seo-console";
import { number } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/seo")({
  head: () => ({
    meta: [{ title: "Search growth — Revora" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminSeo,
});

const KIND_LABELS: Record<string, string> = {
  high_impressions_low_ctr: "Seen but skipped",
  striking_distance: "Nearly ranking",
  growing_impressions: "Rising demand",
  declining_clicks: "Losing clicks",
  commercial_query: "Buyer intent",
};

function AdminSeo() {
  const [raw, setRaw] = useState("");
  const [submitted, setSubmitted] = useState("");

  const audit = useMemo(() => seoAuditSummary(), []);
  const rows = useMemo(() => parseConsoleRows(submitted), [submitted]);
  const coverage = useMemo(() => consoleCoverage(rows), [rows]);
  const opportunities = useMemo(() => seoOpportunities(rows, 30), [rows]);

  return (
    <div className="product-page">
      <SectionHeading eyebrow="Search" title="What to work on next to win more search traffic" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pages checked" value={number(audit.checkedPages)} tone="info" />
        <MetricCard
          label="Pages open to Google"
          value={number(audit.indexablePages)}
          hint="The rest are deliberately kept out of search."
        />
        <MetricCard
          label="Problems to fix"
          value={number(audit.errors)}
          tone={audit.errors > 0 ? "attention" : "signal"}
        />
        <MetricCard label="Things to improve" value={number(audit.warnings)} />
      </div>

      <Panel className="p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-[15px] font-semibold">Page health</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Checked live from the pages Revora publishes right now — titles, descriptions, thin
            pages, internal links and search settings.
          </p>
        </div>
        {audit.issues.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Every page passes"
              description="No missing or duplicate titles and descriptions, no thin or orphaned pages, and no conflicting search settings."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {audit.issues.slice(0, 60).map((issue) => (
              <li
                key={`${issue.code}-${issue.path}-${issue.detail}`}
                className="flex items-start justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px]">{issue.path}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{issue.detail}</p>
                </div>
                <Pill tone={issue.level === "error" ? "attention" : "neutral"}>
                  {issue.level === "error" ? "Fix" : "Improve"}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <GoogleSearchGrowth />
      <GoogleLocalListing />

      <Panel className="p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-[15px] font-semibold">Or paste a Search Console export</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            In Search Console open Performance, then Export, then copy the sheet or the CSV and
            paste it below. Revora reads it here in your browser and ranks what to work on. Nothing
            is uploaded or stored.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <Textarea
            className="min-h-28 font-mono text-[12px]"
            aria-label="Paste your Search Console performance export"
            placeholder="Query,Landing Page,Clicks,Impressions,Position…"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="signal"
              disabled={!raw.trim()}
              onClick={() => setSubmitted(raw)}
            >
              <Search className="mr-1.5 size-4" aria-hidden /> Find my opportunities
            </Button>
            {submitted ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRaw("");
                  setSubmitted("");
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>

          {submitted && rows.length === 0 ? (
            <p className="text-[12.5px]">
              Revora couldn&apos;t read that. It needs the header row plus columns for clicks and
              impressions, and either a page or a query column.
            </p>
          ) : null}

          {rows.length ? (
            <p className="text-[12px] text-muted-foreground">
              Read {number(coverage.rows)} rows across {number(coverage.pages)} pages ·{" "}
              {number(coverage.clicks)} clicks · {number(coverage.impressions)} times shown ·{" "}
              {(coverage.ctr * 100).toFixed(1)}% clicked
              {coverage.comparable
                ? ` · ${number(coverage.comparable)} rows compared with the previous period`
                : ""}
              .
            </p>
          ) : null}
        </div>

        {opportunities.length ? (
          <ol className="divide-y divide-border border-t border-border">
            {opportunities.map((item, index) => (
              <li key={`${item.page}-${item.query}-${item.kind}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">
                    {index + 1}. {item.query ?? item.page}
                  </p>
                  <Pill tone="neutral">{KIND_LABELS[item.kind] ?? item.kind}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.page} · {number(item.impressions)} times shown · {number(item.clicks)}{" "}
                  clicks · {(item.ctr * 100).toFixed(1)}% clicked
                  {item.position ? ` · position ${item.position.toFixed(1)}` : ""}
                </p>
                <p className="mt-1.5 text-[12.5px]">{item.recommendation}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </Panel>
    </div>
  );
}
