import type { PublicSite } from "@/lib/public-site.functions";

type Site = NonNullable<PublicSite>;

export function siteSurface(site: Site): string | null {
  const profile = (site.profile ?? null) as { secondary_color?: string | null } | null;
  const surface = profile?.secondary_color;
  return typeof surface === "string" && surface.trim() ? surface.trim() : null;
}
