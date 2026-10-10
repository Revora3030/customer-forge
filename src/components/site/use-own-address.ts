import { useContext } from "react";
import { OwnAddressContext, SiteBaseContext } from "@/components/site/site-address-context";

export function useOwnAddress() {
  return useContext(OwnAddressContext);
}

/** "/p/<token>" or "/draft/<slug>" inside a preview, otherwise null. */
export function useSiteBase(): string | null {
  return useContext(SiteBaseContext);
}
