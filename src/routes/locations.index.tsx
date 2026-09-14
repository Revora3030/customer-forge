import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { MapPin } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { BusinessDetails } from "@/components/marketing/BusinessDetails";
import { BUSINESS, NC_LOCATIONS } from "@/lib/business-identity";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl } from "@/lib/seo";
import { trackConversion } from "@/lib/conversion";

const TITLE = "Website & Lead Gen for NC Businesses | Revora";
const DESCRIPTION = `Revora builds North Carolina service businesses a complete customer acquisition system — website, instant quotes, online booking, CRM and follow-up.`;

export const Route = createFileRoute("/locations/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/locations"),
    ],
    links: [canonicalLink("/locations")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "Locations", path: "/locations" },
          ]),
        ),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "North Carolina cities Revora serves",
          itemListElement: NC_LOCATIONS.map((location, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `${location.city}, NC`,
            url: `https://revoragrowthsystems.com/locations/${location.slug}`,
          })),
        }),
      },
    ],
  }),
  component: LocationsIndex,
});

function LocationsIndex() {
  useEffect(() => {
    trackConversion("landing_view", { metadata: { landing: "locations_index" } });
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <h1 className="max-w-3xl font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-tight font-semibold">
            Built for <span className="gold-hl">North Carolina</span> business owners
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Revora is run from {BUSINESS.region.name} and serves owners across the state — and
            anywhere in the {BUSINESS.areasServed[1]} or beyond. Pick your city to see how the
            system captures the customers already searching for your service. Outside NC?{" "}
            <Link to="/states" className="text-primary underline-offset-4 hover:underline">
              See all 50 states
            </Link>
            .
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild variant="signal" size="lg">
              <Link to="/get-started">Start free for {GROWTH_SYSTEM.fullAccessTrialDays} days</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <SectionHeading eyebrow="Service areas" title="North Carolina cities" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NC_LOCATIONS.map((location) => (
              <li key={location.slug}>
                <Link
                  to="/locations/$city"
                  params={{ city: location.slug }}
                  className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/50"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="block text-[14px] font-medium">{location.city}, NC</span>
                    <span className="mt-1 block text-[13px] text-muted-foreground">
                      {location.county} · {location.nearby.slice(0, 3).join(", ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <BusinessDetails />
      </main>
      <SiteFooter />
    </div>
  );
}
