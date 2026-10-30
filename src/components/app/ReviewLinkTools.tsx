/**
 * Helpers under a "leave a review" link field: find the free Google
 * writereview link from the business's Google listing (place ID) when the
 * field is empty, and a "Test link" that opens whatever is saved.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findMyGoogleListing } from "@/lib/onboarding-listing.functions";
import { googleReviewUrl } from "@/lib/google-review-link";

export function ReviewLinkTools({
  value,
  query,
  disabled,
  onFill,
}: {
  value: string;
  /** Business name and town, used to find the Google listing. */
  query: string;
  disabled?: boolean;
  onFill: (url: string) => void;
}) {
  const find = useServerFn(findMyGoogleListing);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const link = value.trim();
  const testable = /^https:\/\//i.test(link);

  const lookup = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await find({ data: { query } });
      if (!result.ok) return setNote(result.message);
      const url = result.listings.map((l) => googleReviewUrl(l.placeId)).find(Boolean);
      if (!url) return setNote("No Google listing found. Paste your review link instead.");
      onFill(url);
      setNote(`Filled from the Google listing for ${result.listings[0]?.name ?? "this business"}. Test it before sharing.`);
    } catch (error) {
      setNote((error as Error).message || "Couldn't search Google just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px]">
      {!link ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || busy || query.trim().length < 3}
          onClick={() => void lookup()}
        >
          <Search className="mr-1.5 size-3.5" />
          {busy ? "Searching Google…" : "Find my Google review link"}
        </Button>
      ) : null}
      {testable ? (
        <Button asChild type="button" size="sm" variant="ghost">
          <a href={link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 size-3.5" />
            Test link
          </a>
        </Button>
      ) : null}
      {note ? (
        <span className="text-muted-foreground" role="status">
          {note}
        </span>
      ) : null}
    </div>
  );
}
