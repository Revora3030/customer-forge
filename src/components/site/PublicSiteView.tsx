import { businessFacts } from "@/lib/builder/facts";
import type { PublicSite } from "@/lib/public-site.functions";
import { SitePageView } from "@/components/site/SitePageView";

/**
 * The home address serves whatever the owner actually built. When the builder
 * has a home page with visible sections, that exact page is rendered — the same
 * renderer the other pages and the draft preview use — so the live site can
 * never differ from the editor. A site with no home page yet shows a plain notice; it
 * never falls back to the retired deterministic renderer.
 */
export function PublicSiteView({
  site,
  preview = false,
}: {
  site: NonNullable<PublicSite>;
  preview?: boolean;
}) {
  if ((site?.content?.sections ?? []).length > 0) {
    return <SitePageView site={site} preview={preview} />;
  }
  // Business-safe copy only: the name, plus a phone or email when the profile
  // has a real one (businessFacts drops placeholders). Nothing is invented.
  const facts = businessFacts(site?.profile ?? null, site?.org?.name);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-semibold">{facts.businessName ?? "This website"}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This website is being updated. Please check back soon.
        </p>
        {facts.phone && facts.phoneHref ? (
          <p className="mt-4 text-sm">
            <a href={facts.phoneHref} className="inline-block py-2 font-medium underline underline-offset-4">
              Call {facts.phone}
            </a>
          </p>
        ) : null}
        {facts.email && facts.emailHref ? (
          <p className="text-sm">
            <a href={facts.emailHref} className="inline-block py-2 font-medium underline underline-offset-4">
              Email {facts.email}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
