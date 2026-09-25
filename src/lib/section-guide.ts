/**
 * Plain-English guide for every section type.
 *
 * The builder shows this next to each section so the owner always knows what a
 * section is for and what facts belong in each field. It is presentation copy
 * only — no behaviour depends on it and no website wording is seeded from it.
 */

import { SECTION_LIBRARY } from "@/lib/website-content";

export type SectionGuide = {
  /** What this block is. */
  purpose: string;
  /** Why it helps the site win work — shown as the gold key line. */
  lead: string;
  headingHint: string;
  subHint: string;
  bodyHint: string;
  /** Seed instruction for the website assistant. */
  ask: string;
};

const DEFAULTS: Omit<SectionGuide, "purpose"> = {
  lead: "Every block should support the visitor’s next step using only real business facts.",
  headingHint: "Ask AI to write this from saved facts",
  subHint: "Ask AI to write this from saved facts",
  bodyHint: "Add only facts you want the AI to use",
  ask: "Ask AI to improve this section using only saved facts",
};

const GUIDES: Partial<Record<string, SectionGuide>> = {
  hero: {
    purpose: "The first screen. Visitors decide in seconds whether you can help them.",
    lead: "Use the real offer, service area and available action paths without inventing claims.",
    headingHint: "Ask AI to write the main headline",
    subHint: "Ask AI to write the supporting line",
    bodyHint: "Supply only the facts visitors should see first",
    ask: "Ask AI to rewrite the headline banner from saved facts",
  },
  trust_bar: {
    purpose: "A thin strip of reassurance directly under the headline.",
    lead: "Show only reassurance points the business has actually supplied.",
    headingHint: "Ask AI to write a fact-supported trust line",
    subHint: "Ask AI to write a fact-supported reassurance line",
    bodyHint: "Only claims you can genuinely stand behind",
    ask: "Ask AI to write a trust strip using only saved facts",
  },
  intro: {
    purpose: "A short introduction to your business.",
    lead: "Introduce the business plainly with supplied background and service facts.",
    headingHint: "Ask AI to introduce the business",
    subHint: "Ask AI to use real background details",
    bodyHint: "Two sentences: what you do and who you do it for",
    ask: "Ask AI to introduce the business using saved facts",
  },
  services: {
    purpose: "One card per service, pulled straight from your service list.",
    lead: "Show the saved service list clearly so visitors can find the right option.",
    headingHint: "Ask AI to introduce the services",
    subHint: "Ask AI to summarize the saved service list",
    bodyHint: "A line explaining how someone chooses between your services",
    ask: "Ask AI to rewrite the services section from saved services",
  },
  pricing: {
    purpose: "Starting prices so visitors can judge whether you fit their budget.",
    lead: "Use only real saved price details or explain that pricing has not been supplied.",
    headingHint: "Ask AI to write a pricing heading",
    subHint: "Ask AI to explain only saved price facts",
    bodyHint: "Explain what changes the price, and that quotes are free",
    ask: "Ask AI to write pricing copy from saved pricing facts",
  },
  quote: {
    purpose: "Your instant quote form — it creates a lead in your CRM.",
    lead: "Explain the available quote path using only the configured form and follow-up facts.",
    headingHint: "Ask AI to write a quote-form heading",
    subHint: "Ask AI to explain what the quote form does",
    bodyHint: "Tell the visitor exactly what happens after they submit",
    ask: "Ask AI to rewrite the quote section from saved process facts",
  },
  booking: {
    purpose: "Lets visitors pick a service and a time without phoning.",
    lead: "Explain the saved booking process and what happens after a request.",
    headingHint: "Ask AI to write a booking heading",
    subHint: "Ask AI to explain how booking works",
    bodyHint: "Say what to expect on the day",
    ask: "Ask AI to rewrite the booking section from saved booking facts",
  },
  reviews: {
    purpose: "Published customer reviews. Nothing is ever invented.",
    lead: "Use only imported or owner-supplied reviews; leave the section empty if none exist.",
    headingHint: "Ask AI to introduce real reviews",
    subHint: "Ask AI to use only imported review facts",
    bodyHint: "A line inviting visitors to read more",
    ask: "Ask AI to introduce real imported reviews only",
  },
  gallery: {
    purpose: "Photos of real jobs from your media library.",
    lead: "Use only real uploaded work photos and describe what they actually show.",
    headingHint: "Ask AI to introduce real photos",
    subHint: "Ask AI to describe what the uploaded photos show",
    bodyHint: "Describe the kind of work shown",
    ask: "Ask AI to introduce uploaded photos without adding claims",
  },
  faq: {
    purpose: "Answers to the questions people ask before they commit.",
    lead: "Answer real visitor questions with saved business facts only.",
    headingHint: "Ask AI to write an FAQ heading",
    subHint: "Ask AI to set the tone for answers",
    bodyHint: "Anything you want to say before the questions",
    ask: "Ask AI to draft FAQs from saved facts and known questions",
  },
  guarantee: {
    purpose: "The promise you make — only what you actually offer.",
    lead: "Show only the promise the business actually makes.",
    headingHint: "Ask AI to write the promise heading",
    subHint: "Ask AI to use only the promise you supplied",
    bodyHint: "State the guarantee in plain words",
    ask: "Ask AI to write the guarantee section from the saved promise",
  },
  offer: {
    purpose: "A time-limited offer. Hidden until you write one.",
    lead: "Show an offer only when a real current offer has been supplied.",
    headingHint: "Ask AI to write the offer heading",
    subHint: "Ask AI to use only the offer you supplied",
    bodyHint: "The offer, who it applies to, and when it ends",
    ask: "Ask AI to write offer copy only from the saved offer",
  },
  cta: {
    purpose: "A direct prompt to call, book or request a price.",
    lead: "Point visitors to the real available action paths.",
    headingHint: "Ask AI to write the action heading",
    subHint: "Ask AI to explain the available action paths",
    bodyHint: "One line removing the last hesitation",
    ask: "Ask AI to write an action section using only available contact paths",
  },
  sticky_cta: {
    purpose: "Always-visible call and quote buttons on mobile.",
    lead: "Keep configured mobile actions accessible without inventing labels or destinations.",
    headingHint: "Ask AI to write the sticky action label",
    subHint: "Your phone number",
    bodyHint: "Usually left blank",
    ask: "Ask AI to write sticky mobile labels from available actions",
  },
  area: {
    purpose: "The main area you cover, written for local search.",
    lead: "Use only saved service-area facts for local search copy.",
    headingHint: "Ask AI to write from saved service-area facts",
    subHint: "Ask AI to include only saved places",
    bodyHint: "Name the towns and neighbourhoods you cover",
    ask: "Ask AI to write the service-area section from saved locations",
  },
  areas: {
    purpose: "Links to every town or neighbourhood page.",
    lead: "Link only to saved town or neighbourhood pages.",
    headingHint: "Ask AI to write from saved area pages",
    subHint: "Ask AI to summarize saved area links",
    bodyHint: "A line introducing the list",
    ask: "Ask AI to introduce saved service-area links",
  },
  contact: {
    purpose: "Phone, email and opening hours.",
    lead: "Show only the saved contact methods and opening hours.",
    headingHint: "Ask AI to write from saved contact facts",
    subHint: "Ask AI to mention only available contact paths",
    bodyHint: "When you answer and how quickly you reply",
    ask: "Ask AI to rewrite contact copy from saved contact facts",
  },
  process: {
    purpose: "The three or four steps from enquiry to job done.",
    lead: "Describe only the real process steps the business supplied.",
    headingHint: "Ask AI to write from saved process steps",
    subHint: "Ask AI to summarize the saved process",
    bodyHint: "Describe each step in a sentence",
    ask: "Ask AI to write the process section from saved steps",
  },
  benefits: {
    purpose: "Short reasons to choose you.",
    lead: "Use only real differentiators the owner supplied.",
    headingHint: "Ask AI to write from saved differentiators",
    subHint: "Ask AI to summarize saved differentiators",
    bodyHint: "Reasons that are true for you specifically",
    ask: "Ask AI to write benefits from saved differentiators",
  },
  lead_magnet: {
    purpose: "Trades an email for something genuinely useful.",
    lead: "Offer a resource only when a real resource exists.",
    headingHint: "Ask AI to write from the saved resource",
    subHint: "Ask AI to explain the saved delivery method",
    bodyHint: "What they get and why it helps",
    ask: "Ask AI to write lead-magnet copy from saved resource facts",
  },
};

/** Guide for a section kind — always returns usable copy. */
export function sectionGuide(kind: string): SectionGuide {
  const found = GUIDES[kind];
  if (found) return found;
  const fallback = SECTION_LIBRARY.find((item) => item.kind === kind);
  return { ...DEFAULTS, purpose: fallback?.help ?? "A block of content on this page." };
}
