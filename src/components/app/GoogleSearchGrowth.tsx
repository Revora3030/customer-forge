/**
 * Live Google panels for the search growth page.
 *
 * Everything shown here came back from the connected Google account in this
 * session, and each block states the source and the moment it was read. When
 * Google has nothing to report, or the account isn't authorized for a website,
 * that is said plainly — no placeholder numbers are ever shown.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Panel, Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { number } from "@/lib/format";
import {
  getLocalListing,
  getSearchConsoleGrowth,
  type LocalListingResult,
  type SearchConsoleResult,
} from "@/lib/seo-google.functions";

const KIND_LABELS: Record<string, string> = {
  high_impressions_low_ctr: "Seen but skipped",
  striking_distance: "Nearly ranking",
  growing_impressions: "Rising demand",
  declining_clicks: "Losing clicks",
  commercial_query: "Buyer intent",
};

const readAt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function GoogleSearchGrowth() {
  const fetchGrowth = useServerFn(getSearchConsoleGrowth);
  const [targetUrl, setTargetUrl] = useState("https://revoragrowthsystems.com/");
  const [result, setResult] = useState<SearchConsoleResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (siteUrl?: string) => {
    setLoading(true);
    try {
      const next = await fetchGrowth({ data: { targetUrl, siteUrl: siteUrl ?? null } });
      setResult(next);
      if (!next.ok) toast.error(next.message);
    } catch {
      toast.error("Revora couldn't reach Google just now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel className="p-0">
      <div className="border-b border-border px-4 py-3">
        <p className="font-display text-[15px] font-semibold">Live from your Google account</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Revora reads the last 28 complete days of real search results for a website you have
          verified in Google, then ranks what to work on. Nothing is estimated.
        </p>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-sm"
            aria-label="Website address to read search results for"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://yourbusiness.com/"
          />
          <Button size="sm" variant="signal" disabled={loading || !targetUrl.trim()} onClick={() => load()}>
            <Search className="mr-1.5 size-4" aria-hidden />
            {loading ? "Reading Google…" : "Read my search results"}
          </Button>
        </div>

        {result && !result.ok ? <p className="text-[12.5px]">{result.message}</p> : null}

        {result?.ok && result.status === "choose_property" ? (
          <div className="space-y-2">
            <p className="text-[12.5px]">
              More than one verified Google property covers this address. Choose the one to read:
            </p>
            <div className="flex flex-wrap gap-2">
              {result.candidates.map((candidate) => (
                <Button
                  key={candidate}
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => load(candidate)}
                >
                  {candidate}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {result?.ok && result.status === "data" ? (
          <p className="text-[12px] text-muted-foreground">
            Source: Google Search Console · {result.siteUrl} · {result.period.start} to{" "}
            {result.period.end} · read {readAt(result.fetchedAt)} · {number(result.totals.clicks)}{" "}
            clicks · {number(result.totals.impressions)} times shown across{" "}
            {number(result.totals.rows)} rows.
          </p>
        ) : null}
      </div>

      {result?.ok && result.status === "data" ? (
        result.opportunities.length ? (
          <ol className="divide-y divide-border border-t border-border">
            {result.opportunities.map((item, index) => (
              <li key={`${item.page}-${item.query}-${item.kind}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">
                    {index + 1}. {item.query ?? item.page}
                  </p>
                  <Pill tone="neutral">{KIND_LABELS[item.kind] ?? item.kind}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.page} · {number(item.impressions)} times shown · {number(item.clicks)} clicks
                  · {(item.ctr * 100).toFixed(1)}% clicked
                  {item.position ? ` · position ${item.position.toFixed(1)}` : ""}
                </p>
                <p className="mt-1.5 text-[12.5px]">{item.recommendation}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="border-t border-border p-4">
            <EmptyState
              title="Google has no search data for this website yet"
              description="Nothing was reported for the last 28 days, so there is nothing to recommend. Revora won't invent advice without data."
            />
          </div>
        )
      ) : null}
    </Panel>
  );
}

export function GoogleLocalListing() {
  const lookup = useServerFn(getLocalListing);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LocalListingResult | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const next = await lookup({ data: { query } });
      setResult(next);
      if (!next.ok) toast.error(next.message);
    } catch {
      toast.error("Revora couldn't reach Google just now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel className="p-0">
      <div className="border-b border-border px-4 py-3">
        <p className="font-display text-[15px] font-semibold">Google listing facts</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Look up what Google already publishes about a business — address, phone, website, rating —
          so a customer&apos;s website matches their listing exactly. Only fields Google returned are
          shown.
        </p>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-sm"
            aria-label="Business name and town"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Business name and town"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={loading || query.trim().length < 3}
            onClick={search}
          >
            <MapPin className="mr-1.5 size-4" aria-hidden />
            {loading ? "Asking Google…" : "Find the listing"}
          </Button>
        </div>

        {result && !result.ok ? <p className="text-[12.5px]">{result.message}</p> : null}

        {result?.ok ? (
          result.listings.length ? (
            <ul className="space-y-3">
              {result.listings.map((listing) => (
                <li key={`${listing.name}-${listing.address ?? ""}`} className="rounded-md border border-border p-3">
                  <p className="text-[13px] font-medium">{listing.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {[
                      listing.address,
                      listing.phone,
                      listing.website,
                      listing.rating !== null
                        ? `${listing.rating.toFixed(1)}★${listing.reviewCount !== null ? ` from ${number(listing.reviewCount)} reviews` : ""}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Google returned no public details for this listing."}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Source: Google Maps · read {readAt(listing.fetchedAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px]">
              Google has no matching listing, so there is nothing to copy into the website.
            </p>
          )
        ) : null}
      </div>
    </Panel>
  );
}
