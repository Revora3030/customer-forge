import { type ReactNode } from "react";
import { OwnAddressContext } from "@/components/site/site-address-context";

export function SiteAddressProvider({
  ownAddress,
  children,
}: {
  ownAddress: boolean;
  children: ReactNode;
}) {
  return <OwnAddressContext.Provider value={ownAddress}>{children}</OwnAddressContext.Provider>;
}
