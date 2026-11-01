import { LiveDot } from "@/components/app/Bits";

/**
 * What the workspace header says about the website. It must agree with the
 * Status Center and /app/launch: "Live" is only ever shown for a published
 * site. Anything else is named for what it is, and nothing is shown until the
 * website settings have loaded.
 */
export function siteStateMarker(
  publishState: string | null | undefined,
): { live: boolean; label: string } | null {
  if (publishState === null || publishState === undefined) return null;
  switch (publishState) {
    case "published":
      return { live: true, label: "Live" };
    case "preview":
      return { live: false, label: "Preview, not public yet" };
    case "unpublished":
      return { live: false, label: "Offline" };
    default:
      return { live: false, label: "Draft, not published yet" };
  }
}

export function SiteStateMarker({ state }: { state: string | null | undefined }) {
  const marker = siteStateMarker(state);
  if (!marker) return null;
  return marker.live ? (
    <LiveDot label={marker.label} />
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
      {marker.label}
    </span>
  );
}
