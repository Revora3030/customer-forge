/**
 * Crawlable footer links to pages that search engines have found but not yet
 * indexed (Search Console, 2026-10-31). Plain `<a href>` links in every page's
 * server-rendered footer give each of them a sitewide internal link.
 *
 * Capped on purpose: the rest of the state, guide and location pages stay
 * reachable through their hub pages (/states, /guides, /locations, /local),
 * which the footer already links. Every path here is checked against the SEO
 * inventory in footer-links.test.ts, so a renamed or removed page cannot leave
 * a dead footer link.
 */
export interface FooterLinkGroup {
  heading: string;
  links: readonly { to: string; label: string }[];
}

export const FOOTER_DISCOVERY_GROUPS: readonly FooterLinkGroup[] = [
  {
    heading: "Compare & guides",
    links: [
      { to: "/compare/revora-vs-wix", label: "Revora vs Wix" },
      { to: "/compare/revora-vs-squarespace", label: "Revora vs Squarespace" },
      { to: "/compare/revora-vs-diy-website-builder", label: "Revora vs a DIY website builder" },
      { to: "/compare/revora-vs-buying-leads", label: "Revora vs buying leads" },
      { to: "/compare/revora-vs-hiring-office-help", label: "Revora vs hiring office help" },
      { to: "/guides/get-more-google-reviews", label: "How to get more Google reviews" },
      {
        to: "/guides/optimize-local-service-sales-process",
        label: "Improve your local service sales process",
      },
    ],
  },
  {
    heading: "CRM by trade",
    links: [
      { to: "/crm/electricians", label: "CRM for electricians" },
      { to: "/crm/plumbers", label: "CRM for plumbers" },
      { to: "/crm/hvac", label: "CRM for HVAC companies" },
      { to: "/crm/general-contractors", label: "CRM for general contractors" },
      { to: "/crm/home-service-businesses", label: "CRM for home service businesses" },
    ],
  },
  {
    heading: "Trades & places",
    links: [
      { to: "/local/plumbing", label: "Plumbing growth systems" },
      { to: "/local/auto-detailing", label: "Auto detailing growth systems" },
      { to: "/local/barbers", label: "Barber growth systems" },
      { to: "/local/contractors", label: "Contractor growth systems" },
      { to: "/states/north-carolina", label: "North Carolina" },
      { to: "/locations/durham-nc", label: "Durham, NC" },
      { to: "/locations/concord-nc", label: "Concord, NC" },
    ],
  },
];
