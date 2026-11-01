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
