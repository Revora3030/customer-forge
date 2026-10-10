import { createContext } from "react";

export const OwnAddressContext = createContext(false);

/**
 * Where this copy of the website lives, when it is NOT the public share path:
 * "/p/<token>" for a private share link or "/draft/<slug>" for the owner's
 * draft preview. Site links are written against this base so a preview link
 * opened in a new tab, copied or shared lands on the same preview page instead
 * of the unpublished public address (which answers "not found").
 * Null means the public `/s/<slug>` path (or the owner's own domain).
 */
export const SiteBaseContext = createContext<string | null>(null);
