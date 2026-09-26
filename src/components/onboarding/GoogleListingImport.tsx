import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findMyGoogleListing, type ListingSuggestion } from "@/lib/onboarding-listing.functions";

/**
 * Offers the business's public Google listing as a starting point. Nothing is
 * filled until the owner picks their own listing, and every field stays editable.
 */
export function GoogleListingImport(props: {
  query: string;
  onUse: (listing: ListingSuggestion) => void;
}) {
  const lookup = useServerFn(findMyGoogleListing);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<ListingSuggestion[] | null>(null);

  async function search() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await lookup({ data: { query: props.query } });
      if (!res.ok) setMessage(res.message);
      else if (!res.listings.length) setMessage("No Google listing found. Type your details below.");
      else setFound(res.listings);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-[13px]">
      {!found ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">Already on Google Maps? Fill these in from your listing.</span>
          <Button type="button" size="sm" variant="outline" disabled={busy || props.query.trim().length < 3} onClick={search}>
            <MapPin className="mr-1.5 h-4 w-4" />
            {busy ? "Searching…" : "Find my listing"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground">Pick your business — you can edit anything after.</p>
          {found.map((l) => (
            <button
              key={`${l.name}-${l.address}`}
              type="button"
              className="w-full rounded-md border border-border bg-background p-2 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => {
                props.onUse(l);
                setFound(null);
                setMessage("Filled from your Google listing. Please check each detail.");
              }}
            >
              <span className="block font-medium">{l.name}</span>
              {l.address ? <span className="block text-muted-foreground">{l.address}</span> : null}
            </button>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setFound(null)}>
            None of these
          </Button>
        </div>
      )}
      {message ? <p className="mt-2 text-muted-foreground" role="status">{message}</p> : null}
    </div>
  );
}
