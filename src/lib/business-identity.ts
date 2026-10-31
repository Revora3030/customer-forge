/**
 * Revora's own verified business identity — the single source of truth for the
 * name, contact details and areas Google shows in search results.
 *
 * These are the PLATFORM's details. Client business websites always use their
 * own tenant contact settings (`business_profiles`), never these constants.
 *
 * Revora is a service-area business: it has no public street address, so the
 * structured data below intentionally omits `streetAddress` and uses
 * `areaServed` instead. Adding a fake or unstaffed address would risk a Google
 * Business Profile suspension.
 */

import { REVORA } from "@/lib/brand";

export const BUSINESS = {
  legalName: "Revora Growth Systems",
  displayName: "Revora Growth Systems",
  /** No public street address: Revora operates remotely, service-area only. */
  serviceAreaOnly: true,
  region: { name: "North Carolina", code: "NC", country: "US" },
  /** Widest honest reach, most specific first. */
  areasServed: ["North Carolina", "United States", "Worldwide"],
  phone: REVORA.phone,
  phoneDisplay: REVORA.phoneDisplay,
  tel: `+1${REVORA.phone}`,
  email: REVORA.email,
  founder: REVORA.founder.name,
  languages: ["English"],
  priceRange: "$$",
} as const;

/** North Carolina metros Revora targets for local search, largest first. */
export const NC_LOCATIONS = [
  {
    slug: "charlotte-nc",
    city: "Charlotte",
    county: "Mecklenburg County",
    nearby: ["Concord", "Gastonia", "Matthews", "Huntersville"],
    trades: ["contractors", "hvac", "pressure-washing", "cleaning"],
  },
  {
    slug: "raleigh-nc",
    city: "Raleigh",
    county: "Wake County",
    nearby: ["Cary", "Apex", "Wake Forest", "Garner"],
    trades: ["landscaping", "auto-detailing", "roofing", "home-services"],
  },
  {
    slug: "greensboro-nc",
    city: "Greensboro",
    county: "Guilford County",
    nearby: ["High Point", "Burlington", "Kernersville"],
    trades: ["plumbing", "cleaning", "contractors", "barbers"],
  },
  {
    slug: "durham-nc",
    city: "Durham",
    county: "Durham County",
    nearby: ["Chapel Hill", "Hillsborough", "Morrisville"],
    trades: ["med-spa", "beauty", "fitness", "professional-services"],
  },
  {
    slug: "winston-salem-nc",
    city: "Winston-Salem",
    county: "Forsyth County",
    nearby: ["Clemmons", "Lewisville", "Mocksville"],
    trades: ["roofing", "hvac", "landscaping", "photography"],
  },
  {
    slug: "fayetteville-nc",
    city: "Fayetteville",
    county: "Cumberland County",
    nearby: ["Hope Mills", "Spring Lake", "Raeford"],
    trades: ["auto-detailing", "barbers", "cleaning", "pressure-washing"],
  },
  {
    slug: "wilmington-nc",
    city: "Wilmington",
    county: "New Hanover County",
    nearby: ["Leland", "Carolina Beach", "Hampstead"],
    trades: ["pressure-washing", "landscaping", "photography", "home-services"],
  },
  {
    slug: "asheville-nc",
    city: "Asheville",
    county: "Buncombe County",
    nearby: ["Hendersonville", "Black Mountain", "Weaverville"],
    trades: ["hair-stylists", "beauty", "photography", "contractors"],
  },
  {
    slug: "greenville-nc",
    city: "Greenville",
    county: "Pitt County",
    nearby: ["Winterville", "Washington", "Ayden"],
    trades: ["cleaning", "hvac", "fitness", "auto-detailing"],
  },
  {
    slug: "concord-nc",
    city: "Concord",
    county: "Cabarrus County",
    nearby: ["Kannapolis", "Harrisburg", "Mooresville"],
    trades: ["contractors", "roofing", "plumbing", "landscaping"],
  },
] as const;

export type NcLocation = (typeof NC_LOCATIONS)[number];

export function findLocation(slug: string): NcLocation | undefined {
  return NC_LOCATIONS.find((location) => location.slug === slug);
}
