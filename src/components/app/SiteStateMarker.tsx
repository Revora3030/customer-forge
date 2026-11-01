import { LiveDot } from "@/components/app/Bits";
import { siteStateMarker } from "@/lib/site-state-marker";

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
