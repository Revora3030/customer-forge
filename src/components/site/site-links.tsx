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
import { type CSSProperties, type ReactNode } from "react";
import { useOwnAddress } from "@/components/site/use-own-address";

/** Link to a page of the same website. `page` empty/null means the home page. */
export function SitePageLink({
  slug,
  page,
  className,
  style,
  blockId,
  children,
}: {
  slug: string;
  page?: string | null;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  blockId?: string | undefined;
  children: ReactNode;
}) {
  const ownAddress = useOwnAddress();
  if (page?.startsWith("#")) {
    return (
      <a href={ownAddress ? `/${page}` : `/s/${encodeURIComponent(slug)}${page}`} className={className} style={style} data-rvb={blockId}>
        {children}
      </a>
    );
  }
  if (ownAddress) {
    return (
      <a href={page ? `/${page}` : "/"} className={className} style={style} data-rvb={blockId}>
        {children}
      </a>
    );
  }
  if (!page) {
    return (
      <Link to="/s/$slug" params={{ slug }} className={className} style={style} data-rvb={blockId}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/s/$slug/$page" params={{ slug, page }} className={className} style={style} data-rvb={blockId}>
      {children}
    </Link>
  );
}
