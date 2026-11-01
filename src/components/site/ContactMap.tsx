import { mapsEmbedFromSavedLink } from "@/lib/maps-link";
import type { PublicSite } from "@/lib/public-site.functions";

type Site = NonNullable<PublicSite>;

/**
 * Free Google Maps frame (no API key) for the business's own Google Maps link,
 * shown in the contact section. Renders nothing unless the owner saved a Maps
 * link we can read, so a site without one never shows an empty or broken box.
 */
export function ContactMap({ site }: { site: Site }) {
  const map = mapsEmbedFromSavedLink(site.social?.google_business);
  if (!map) return null;
  return (
    <div className="rv-contact-map mt-6 h-72 overflow-hidden rounded-lg border border-border bg-background" data-testid="contact-map">
      <iframe
        src={map.url}
        title={`Map showing ${map.name}`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="size-full border-0"
      />
    </div>
  );
}
