/**
 * Public website links.
 *
 * A client website is reachable two ways: on the customer's own verified domain,
 * where pages live at `/about`, and on the platform share path at
 * `/s/<slug>/about`. Visitors must never see builder-shaped URLs on the
 * customer's own domain, so every in-site link goes through this component and
 * picks the right shape for the address being served.
 */
import { Link } from "@tanstack/react-router";
import { createContext, useContext, type ReactNode } from "react";

const OwnAddressContext = createContext(false);

/** Wrap the rendered website when it is served on the client's own address. */
export function SiteAddressProvider({
  ownAddress,
  children,
}: {
  ownAddress: boolean;
  children: ReactNode;
}) {
  return <OwnAddressContext.Provider value={ownAddress}>{children}</OwnAddressContext.Provider>;
}

export function useOwnAddress() {
  return useContext(OwnAddressContext);
}

/** Link to a page of the same website. `page` empty/null means the home page. */
export function SitePageLink({
  slug,
  page,
  className,
  children,
}: {
  slug: string;
  page?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const ownAddress = useOwnAddress();
  if (page?.startsWith("#")) {
    return (
      <a href={ownAddress ? `/${page}` : `/s/${encodeURIComponent(slug)}${page}`} className={className}>
        {children}
      </a>
    );
  }
  if (ownAddress) {
    return (
      <a href={page ? `/${page}` : "/"} className={className}>
        {children}
      </a>
    );
  }
  if (!page) {
    return (
      <Link to="/s/$slug" params={{ slug }} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/s/$slug/$page" params={{ slug, page }} className={className}>
      {children}
    </Link>
  );
}
