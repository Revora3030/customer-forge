import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DEMO_SITE_LIVE, DEMO_SITE_REFRESHING_NOTE, DEMO_SITE_SLUG } from "@/lib/demo-workspace";

type Props = {
  children: ReactNode;
  variant?: "signal" | "outline";
  size?: "lg" | "default";
  live?: boolean;
};

/**
 * Link to the public sample business site, or, while that site is being
 * refreshed, a disabled button with an honest note instead of a link to a
 * holding page.
 */
export function DemoSiteButton({
  children,
  variant = "signal",
  size = "default",
  live = DEMO_SITE_LIVE,
}: Props) {
  if (live) {
    return (
      <Button asChild variant={variant} size={size}>
        <Link to="/s/$slug" params={{ slug: DEMO_SITE_SLUG }}>
          {children}
        </Link>
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant={variant} size={size} disabled aria-describedby="demo-site-refreshing">
        {children}
      </Button>
      <span id="demo-site-refreshing" className="text-[12px] text-muted-foreground">
        {DEMO_SITE_REFRESHING_NOTE}
      </span>
    </span>
  );
}
