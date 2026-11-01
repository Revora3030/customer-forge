import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readMapsLink } from "@/lib/maps-link.functions";
import { canonicalMapsLink, mapsEmbedUrl, type MapsLinkFields } from "@/lib/maps-link";

/** What the owner confirmed from a Google Maps link. */
export type ConfirmedMapsPlace = {
  name: string;
  city: string;
  state: string;
  /** Short Maps link saved as the business's Google link; empty when the owner skipped the map. */
  link: string;
};

/**
 * "Find us on Google Maps? Start from your link." Reads only the link text
 * (name and map pin), shows the owner what it found to confirm or edit, and
 * only then hands it to the form. Hours, phone, reviews and ratings are never
 * read from here; the owner types those.
 */
export function MapsLinkImport(props: {
  /** A Maps link already typed on the homepage; read once on arrival. */
  initialUrl?: string;
  onUse: (place: ConfirmedMapsPlace) => void;
}) {
  const read = useServerFn(readMapsLink);
  const [url, setUrl] = useState(props.initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<MapsLinkFields | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [showMap, setShowMap] = useState(true);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  async function run(address = url) {
    if (address.trim().length < 8 || busy) return;
    setBusy(true);
    setMessage(null);
    setFound(null);
    setDone(false);
    try {
      const result = await read({ data: { url: address } });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setFound(result.fields);
      setName(result.fields.name);
      setCity(result.fields.city);
      setState(result.fields.state);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't read that link.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (props.initialUrl && !started.current) {
      started.current = true;
      setUrl(props.initialUrl);
      void run(props.initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialUrl]);

  const hasPin = found ? found.lat !== null && found.lng !== null : false;
  const embed = found ? mapsEmbedUrl({ name, city, lat: found.lat, lng: found.lng }) : null;

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-[13px]">
      <p className="flex items-center gap-1.5 font-medium">
        <MapPin className="size-4 text-primary" aria-hidden /> On Google Maps? Start from your link.
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Open your business in Google Maps, tap Share, copy the link and paste it here. Revora reads only the name and
        map pin from the link. Hours, phone and reviews are not read, so you type those.
      </p>
      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <Input
          aria-label="Your Google Maps link"
          inputMode="url"
          autoComplete="off"
          placeholder="https://maps.app.goo.gl/…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || url.trim().length < 8} className="shrink-0">
          {busy ? "Reading link…" : "Read my link"}
        </Button>
      </form>

      {found && !done ? (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-background p-3">
          <p className="text-[12px] text-muted-foreground">Here is what the link says. Fix anything that isn't right.</p>
          <div className="space-y-1.5">
            <Label htmlFor="ml-name">Business name</Label>
            <Input id="ml-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
            <div className="space-y-1.5">
              <Label htmlFor="ml-city">City or area</Label>
              <Input id="ml-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Type your city" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ml-state">State</Label>
              <Input id="ml-state" value={state} maxLength={2} onChange={(event) => setState(event.target.value.toUpperCase())} placeholder="NC" />
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {hasPin ? "Map pin found in your link." : "No map pin in your link, so the map will search for your business name."}
          </p>
          {embed ? (
            <div className="h-40 overflow-hidden rounded-md border border-border">
              <iframe
                src={embed}
                title={`Map preview for ${name || "your business"}`}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin"
                className="size-full border-0"
              />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={showMap} onChange={(event) => setShowMap(event.target.checked)} />
            Show this map in the contact section of my site
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={name.trim().length < 2}
              onClick={() => {
                const link = showMap ? (canonicalMapsLink({ name, city, state, lat: found.lat, lng: found.lng }) ?? "") : "";
                props.onUse({ name: name.trim(), city: city.trim(), state: state.trim(), link });
                setDone(true);
                setMessage("Filled in. Please check each step and add your hours and phone.");
              }}
            >
              Use these details
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFound(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className="mt-2 text-[12px] text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
