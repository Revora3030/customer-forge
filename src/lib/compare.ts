/**
 * Comparison pages.
 *
 * These target the highest-intent free search traffic there is: an owner who
 * already knows they need something and is deciding between options. Every
 * claim about the alternatives is limited to what is objectively structural
 * (what you get, who owns it, what it costs to run) — no invented prices for
 * other companies, no disparagement, no fabricated statistics.
 */

import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";

const SETUP = usdExact(GROWTH_SYSTEM.setupPrice);
const MONTHLY = usdExact(GROWTH_SYSTEM.monthlyPrice);

export interface CompareRow {
  factor: string;
  revora: string;
  other: string;
}

export interface Comparison {
  slug: string;
  /** Short label used in navigation. */
  label: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  otherName: string;
  /** Honest summary of when the alternative is the better answer. */
  whenOther: string;
  rows: readonly CompareRow[];
  faqs: readonly { q: string; a: string }[];
}

export const COMPARISONS: readonly Comparison[] = [
  {
    slug: "revora-vs-marketing-agency",
    label: "Revora vs a marketing agency",
    title: "Revora vs a marketing agency — what local businesses actually get",
    description: `Comparing Revora's ${SETUP} setup and ${MONTHLY}/month growth system with hiring a marketing agency: what you own, what runs automatically, what you pay monthly and how fast you launch.`,
    heading: "Revora vs a marketing agency",
    intro:
      "Agencies sell services delivered by people: strategy calls, campaign management, monthly reports. Revora sells a system your business runs on. The difference shows up in what you own, what keeps working when nobody is on the clock, and what happens to your leads.",
    otherName: "Typical marketing agency",
    whenOther:
      "If you already have a working website, a full pipeline and a real ad budget you want managed aggressively, a specialist agency can outperform any self-running system on paid media specifically.",
    rows: [
      {
        factor: "What you get",
        revora:
          "A complete system: website, instant quotes, booking, CRM, follow-up, reviews, local SEO and analytics.",
        other: "Services around your existing assets — usually ads, content or SEO retainers.",
      },
      {
        factor: "Who owns the assets",
        revora:
          "You. The site, the customer list, the leads and the data are yours and exportable.",
        other: "Varies. Ad accounts, landing pages and lists are often held inside the agency.",
      },
      {
        factor: "Cost structure",
        revora: `${SETUP} one time, first month free, then ${MONTHLY}/month. Cancel anytime.`,
        other: "Monthly retainer, often plus ad spend and build fees, usually on a contract term.",
      },
      {
        factor: "Speed to live",
        revora:
          "Onboarding generates your site from your real services, area and pricing; 3 days of full access first.",
        other: "Discovery, design and revision cycles measured in weeks.",
      },
      {
        factor: "What happens to a lead at 9pm",
        revora:
          "Instant automatic reply, logged in your pipeline, follow-up scheduled without you.",
        other: "Usually forwarded to your inbox. Response time is still on you.",
      },
      {
        factor: "Reporting",
        revora:
          "Live dashboard tying leads and booked jobs to the page, city and channel that produced them.",
        other: "Periodic report, typically traffic and campaign metrics.",
      },
    ],
    faqs: [
      {
        q: "Can I use both?",
        a: "Yes, and it is a common setup. Revora becomes the site and the lead engine that ads and agency campaigns point at, so paid traffic stops landing on a page that cannot capture or follow up.",
      },
      {
        q: "Do I get a human at all?",
        a: "Yes — support and system management are included in the monthly fee. What is not included is a retainer for work the system already does automatically.",
      },
    ],
  },
  {
    slug: "revora-vs-diy-website-builder",
    label: "Revora vs DIY website builders",
    title: "Revora vs DIY website builders — website vs. customer acquisition system",
    description: `A DIY builder gives you pages. Revora gives you the system that turns visitors into booked jobs: instant quotes, booking, CRM, follow-up and reviews for ${SETUP} setup and ${MONTHLY}/month.`,
    heading: "Revora vs DIY website builders",
    intro:
      "Drag-and-drop builders are good at producing pages. The problem is that a page is not a pipeline: a visitor still has to call you, you still have to reply, quote, schedule, follow up and ask for the review. That is where the revenue actually leaks.",
    otherName: "DIY website builder",
    whenOther:
      "If all you need is a simple brochure page and you enjoy building it yourself, a DIY builder is cheaper and perfectly adequate.",
    rows: [
      {
        factor: "Website",
        revora:
          "Generated from your real services, service area and pricing, then editable in a visual builder.",
        other: "You build it, page by page, from a template.",
      },
      {
        factor: "Instant quotes",
        revora: "Built in. Visitors answer questions and see a price range you control.",
        other: "Not included. Usually a plugin or a contact form.",
      },
      {
        factor: "Booking against real availability",
        revora: "Built in, tied to your services and durations.",
        other: "Add-on app, separate subscription.",
      },
      {
        factor: "CRM and pipeline",
        revora: "Every call, form, quote and booking in one pipeline with statuses and follow-up.",
        other: "Not included.",
      },
      {
        factor: "Automatic follow-up and reviews",
        revora: "Included and running by default.",
        other: "Separate tools you connect and maintain.",
      },
      {
        factor: "Total moving parts",
        revora: "One system, one monthly fee, one support contact.",
        other: "Builder subscription plus several add-ons that must keep working together.",
      },
    ],
    faqs: [
      {
        q: "I already have a website. Is it wasted?",
        a: "No. Your content, photos and domain move over. What changes is that the site is now attached to quoting, booking, CRM and follow-up instead of standing alone.",
      },
      {
        q: "Can I still edit my own site?",
        a: "Yes. The visual builder lets you edit sections, text, images, colors and pages yourself, and every change can be rolled back.",
      },
    ],
  },
  {
    slug: "revora-vs-buying-leads",
    label: "Revora vs buying leads",
    title: "Revora vs buying leads from lead marketplaces",
    description: `Bought leads are rented, shared and priced per contact. Revora builds the asset that produces your own leads — website, quotes, booking, CRM and reviews — for ${SETUP} setup and ${MONTHLY}/month.`,
    heading: "Revora vs buying leads",
    intro:
      "Lead marketplaces solve today's empty schedule. They do not build anything: the moment you stop paying, the leads stop, and the same enquiry is usually sold to several businesses at once. Owning the channel is the only version that compounds.",
    otherName: "Lead marketplaces",
    whenOther:
      "When your schedule is empty this week, buying a few leads is a legitimate short-term bridge while your own channel is being built.",
    rows: [
      {
        factor: "Who the lead belongs to",
        revora: "You. It came to your site, and it stays in your CRM.",
        other: "The marketplace. It is typically shared with competitors.",
      },
      {
        factor: "Cost behaviour over time",
        revora: `Fixed ${MONTHLY}/month regardless of how many leads you get.`,
        other: "Per lead. Costs rise with volume and with competition.",
      },
      {
        factor: "What you own after a year",
        revora: "A ranking site, a customer list, review history and attribution data.",
        other: "Invoices.",
      },
      {
        factor: "Response speed",
        revora: "Automatic instant reply, then scheduled follow-up.",
        other: "You are racing the other businesses who bought the same lead.",
      },
      {
        factor: "Repeat business",
        revora: "Past customers are in your CRM with reminders and review requests.",
        other: "Nothing carries over.",
      },
    ],
    faqs: [
      {
        q: "Should I stop buying leads immediately?",
        a: "No. Keep whatever is currently paying for itself, point those leads into your Revora pipeline so nothing is lost, and let your own channel take over as it grows.",
      },
    ],
  },
  {
    slug: "revora-vs-hiring-office-help",
    label: "Revora vs hiring office help",
    title: "Revora vs hiring someone to answer, quote and schedule",
    description: `Compare a ${MONTHLY}/month system that replies, quotes, books and follows up automatically with hiring part-time office help to do it manually.`,
    heading: "Revora vs hiring office help",
    intro:
      "Most owners hit the same wall: the phone, the quotes, the scheduling and the follow-up outgrow the truck. The usual answer is to hire. The other answer is to make the work stop existing.",
    otherName: "Part-time office help",
    whenOther:
      "When the work genuinely requires judgement — complex bids, difficult customers, site visits, purchasing — a person is irreplaceable. A system should be handling the repetitive part so that person is spent on the valuable part.",
    rows: [
      {
        factor: "Coverage",
        revora: "24/7. Replies at 11pm and on Sunday exactly like Tuesday at 10am.",
        other: "Their working hours only.",
      },
      {
        factor: "Cost",
        revora: `${MONTHLY}/month, fixed.`,
        other: "Wage plus payroll costs, training and turnover.",
      },
      {
        factor: "Consistency",
        revora: "Every lead gets the same first reply, quote structure and follow-up sequence.",
        other: "Varies by person, by day and by workload.",
      },
      {
        factor: "Institutional memory",
        revora: "Every conversation, quote and job stays in the CRM permanently.",
        other: "Leaves when they do, unless it was written down.",
      },
      {
        factor: "Scales with volume",
        revora: "Handles 10 or 200 enquiries the same way.",
        other: "Needs more hours or more people.",
      },
    ],
    faqs: [
      {
        q: "Will this replace my office manager?",
        a: "Not the judgement part. It removes the repetitive part — answering first, sending price ranges, chasing unreplied quotes, requesting reviews — so a person's hours go to work that actually needs a person.",
      },
    ],
  },
] as const;

export function findComparison(slug: string): Comparison | null {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}

export function comparePaths(): string[] {
  return ["/compare", ...COMPARISONS.map((c) => `/compare/${c.slug}`)];
}
