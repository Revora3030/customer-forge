import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { canonicalLink, ogUrl } from "@/lib/seo";

/** Shared copy for public marketing heads and the search inventory, never tenant pages. */
export const MARKETING_SEARCH = {
  home: {
    path: "/",
    title: "AI Websites, CRM & Follow-Up | Revora Growth Systems",
    description: `Build your business website, capture leads, manage bookings and automate follow-up. ${usd(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usd(GROWTH_SYSTEM.monthlyPrice)}/month.`,
  },
  states: {
    path: "/states",
    title: "Business Websites & CRM in All 50 States | Revora",
    description: "Explore business websites, lead capture, CRM and booking across all 50 states. Browse service areas, compare the offer and try Revora free for 3 days.",
  },
  about: {
    path: "/about",
    title: "About Revora Growth Systems | AI Websites & Business CRM",
    description: "Meet Revora Growth Systems: AI-designed business websites, lead capture, booking, CRM and follow-up. Learn our approach, explore the product and see pricing.",
  },
} as const;

export function marketingSearchHead(page: (typeof MARKETING_SEARCH)[keyof typeof MARKETING_SEARCH]) {
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
      { property: "og:title", content: page.title },
      { property: "og:description", content: page.description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: page.title },
      { name: "twitter:description", content: page.description },
      ogUrl(page.path),
    ],
    links: [canonicalLink(page.path)],
  };
}