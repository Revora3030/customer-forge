import { useContext } from "react";
import { OwnAddressContext } from "@/components/site/site-address-context";

export function useOwnAddress() {
  return useContext(OwnAddressContext);
}
