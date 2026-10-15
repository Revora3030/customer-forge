/**
 * Trade-specific CRM pages.
 *
 * These target the highest-value free search demand in Revora's market: an
 * owner searching for "crm for electricians", "roofing crm software",
 * "construction crm" and so on. Each page is written for one trade's real
 * working day — the searches differ because the jobs differ, and a page that
 * ignores that ranks for nothing.
 *
 * Rules for every word in this file:
 * - Only Revora's real capabilities and real prices (from @/lib/offer).
 * - No invented statistics, results, customer counts or testimonials.
 * - No invented prices, features or criticism for other software.
 * - Say plainly when something else is the better answer.
 */

import { GROWTH_SYSTEM } from "@/lib/offer";

// Short, human price forms for titles and prose ("$750", not "$750.00").
const SETUP = `$${GROWTH_SYSTEM.setupPrice}`;
const MONTHLY = `$${GROWTH_SYSTEM.monthlyPrice}`;

export interface CrmPoint {
  title: string;
  body: string;
}

export interface CrmSolution {
  slug: string;
  /** Short label used in navigation and lists. */
  label: string;
  /** The trade, phrased as the owner would say it. */
  trade: string;
  metaTitle: string;
  description: string;
  heading: string;
  intro: string;
  /** What actually goes wrong in this trade before a system exists. */
  problems: readonly CrmPoint[];
  /** How the Revora system handles that specific workflow. */
  workflow: readonly CrmPoint[];
  /** Honest note on when a different tool suits them better. */
  whenNotUs: string;
  faqs: readonly { q: string; a: string }[];
}

const PRICING_ANSWER = `${SETUP} one time to build and launch your system, your first month of the ${MONTHLY}/month platform fee free, then ${MONTHLY}/month from month two. Cancel anytime, and your website, customer list and job history stay yours and exportable.`;

const OWNERSHIP_ANSWER =
  "Yes. The website, the customer records, the quote history and the lead data belong to your business, not to us, and you can export them whenever you want.";

export const CRM_SOLUTIONS: readonly CrmSolution[] = [
  {
    slug: "electricians",
    label: "Electricians",
    trade: "electrical contractors",
    metaTitle: `CRM for Electricians — Leads, Quotes & Scheduling | ${MONTHLY}/mo`,
    description: `A CRM for electricians that captures service calls, quotes panel and rewire work, schedules crews and chases unanswered estimates automatically. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "CRM for electricians",
    intro:
      "Electrical work splits into two businesses that behave nothing alike: same-day service calls where whoever answers first wins, and planned work — panel upgrades, rewires, EV chargers, generators — that is decided over days by a homeowner comparing written estimates. Most electricians lose money at the seam between them, because the urgent calls swallow the day and the planned estimates quietly go cold.",
    problems: [
      {
        title: "Service calls are won on answer time, and you are in an attic",
        body: "A homeowner with a dead circuit calls three electricians and books the first one who responds. Every call you take from a crawlspace three hours later is a call someone else already booked.",
      },
      {
        title: "Panel and rewire estimates need following up, not just sending",
        body: "Larger jobs are compared, discussed with a spouse, and often decided a week later. An estimate sent once and never mentioned again is the single most common lost job in this trade.",
      },
      {
        title: "Permit and inspection work stretches the timeline",
        body: "Jobs that involve permits, utility coordination or inspection sign-off sit in limbo, and without a record of where each one stands, the follow-through depends on memory.",
      },
      {
        title: "Repeat and referral value goes untracked",
        body: "The customer whose panel you upgraded is the customer who needs an EV charger next year. If they only exist in your call log, that second job goes to whoever advertises.",
      },
    ],
    workflow: [
      {
        title: "Every call, form and quote request becomes one record",
        body: "Website forms, quote requests and click-to-call all create a contact with the job details, address and service type attached — no job lives only in a text thread.",
      },
      {
        title: "After-hours enquiries get an instant reply",
        body: "A lead arriving at 9pm gets an immediate automatic acknowledgement with what happens next, so you are still in the running when you read it in the morning.",
      },
      {
        title: "Quotes built from your own service list and pricing",
        body: "Send an estimate as a link built from the services and prices you set, and see when the customer opens it — so you know who to call rather than guessing.",
      },
      {
        title: "Follow-up on unanswered estimates runs without you",
        body: "Automated email and text follow-up keeps open estimates moving on a schedule instead of dying after one unreturned call.",
      },
      {
        title: "Booking that reflects real job length",
        body: "Online booking uses the duration you set per service, so a service call and a panel upgrade never get slotted the same way, and double bookings are blocked at the source.",
      },
      {
        title: "Reviews requested at the right moment",
        body: "Once a job is completed the system asks for a review with a one-tap link, which is what makes you visible to the next person searching in your area.",
      },
    ],
    whenNotUs:
      "If you run a large commercial electrical operation whose real problem is project management — submittals, RFIs, change orders and progress billing across long builds — a dedicated construction project management platform fits that better than any lead-and-follow-up system, including ours.",
    faqs: [
      {
        q: "Does this replace my scheduling software?",
        a: "For most residential and light-commercial electrical businesses, yes: quoting, booking, job records, follow-up and reviews run in one place. If you rely on specialist features like technician GPS dispatching or parts inventory, keep that tool and use Revora for the website, lead capture and follow-up side.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Can I try it before paying monthly?",
        a: `You get ${GROWTH_SYSTEM.fullAccessWindow} of full access to the whole system when you start, and your first month of the ${MONTHLY}/month fee is free, so the first monthly charge lands 30 days in.`,
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "plumbers",
    label: "Plumbers",
    trade: "plumbing companies",
    metaTitle: `Plumbing CRM Software — Emergency Calls, Quotes & Follow-Up | ${MONTHLY}/mo`,
    description: `Plumbing CRM software that answers emergency enquiries instantly, quotes repairs and repipes, books jobs by real duration and collects reviews. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "Plumbing CRM software",
    intro:
      "Plumbing has the least forgiving lead in home services. A leak is not a project a homeowner researches — it is an emergency where the first plumber who replies gets the job and everyone else gets a voicemail nobody returns. Around that sit the planned jobs, water heaters, repipes and bathroom work, which behave like considered purchases and need patient written follow-up.",
    problems: [
      {
        title: "Emergency leads expire in minutes",
        body: "Someone standing in water calls down the list until a human answers. If your form submission sits unread while you are under a sink, that job is gone before you see it.",
      },
      {
        title: "Nights and weekends are when leaks happen",
        body: "The enquiries most likely to convert arrive exactly when nobody is at a desk, and an unattended form is indistinguishable from a business that is closed.",
      },
      {
        title: "Planned work needs a written quote and a nudge",
        body: "Water heater replacements and repipes get compared. A verbal number over the phone loses to a written estimate the homeowner can reread and show a partner.",
      },
      {
        title: "Reviews decide who gets the next emergency call",
        body: "Nobody in a plumbing emergency reads a brochure — they pick from what is visible and well reviewed nearby. Reviews you never ask for are reviews you do not have.",
      },
    ],
    workflow: [
      {
        title: "Instant automatic reply to every enquiry",
        body: "Each form or quote request triggers an immediate acknowledgement telling the customer they have reached a real business and what happens next, day or night.",
      },
      {
        title: "One pipeline for emergency and planned work",
        body: "Every lead lands as a contact record with the problem, the address and the service type, so urgent calls and pending estimates never live in separate places.",
      },
      {
        title: "Written quotes sent as a link",
        body: "Build the estimate from your own service list and pricing, send it as a link, and see when it is opened so your follow-up is timed rather than random.",
      },
      {
        title: "Automatic follow-up on open estimates",
        body: "Email and text follow-up runs on a schedule for anything unanswered, which is where most recovered plumbing revenue actually comes from.",
      },
      {
        title: "Booking that cannot double-book you",
        body: "Online booking uses per-service durations you control and blocks overlapping appointments, so a repipe and a service call are never stacked on top of each other.",
      },
      {
        title: "Review requests after completed jobs",
        body: "Completed work triggers a one-tap review request, feeding the local visibility that produces the next emergency call.",
      },
    ],
    whenNotUs:
      "If you run a large fleet where the core problem is dispatch logistics — live technician tracking, van inventory, complex on-call rotations — a specialist field service dispatch platform handles that better, and you would use us for the website, lead capture and follow-up instead.",
    faqs: [
      {
        q: "Will it answer emergency calls for me?",
        a: "It replies instantly to web enquiries and quote requests and logs them for you, and it can show click-to-call so a caller reaches you directly. It does not take live phone calls on your behalf — it makes sure nothing arriving through your website goes unanswered.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Can I keep the phone number and email I use now?",
        a: "Yes. The system works around your existing phone number and email address; nothing about how customers already reach you has to change.",
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "roofers",
    label: "Roofers",
    trade: "roofing contractors",
    metaTitle: `Roofing CRM Software — Inspections, Estimates & Follow-Up | ${MONTHLY}/mo`,
    description: `Roofing CRM software that captures storm and replacement leads, tracks inspections, sends written estimates and follows up until a decision. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "Roofing CRM software",
    intro:
      "Roofing is a long-cycle, high-ticket sale disguised as an emergency trade. A leak call books an inspection, the inspection produces an estimate, and the estimate then waits — on an insurance decision, a spouse, a second opinion, or next spring. Roofers rarely lose jobs at the quote; they lose them in the weeks after it, when nobody follows up.",
    problems: [
      {
        title: "Storm demand arrives all at once",
        body: "After weather, a week's worth of leads lands in two days. Whatever is not captured in a system in that window is simply lost, because there is no time to sort a full inbox.",
      },
      {
        title: "Inspection to decision takes weeks",
        body: "Between the roof inspection and the signature sit insurance timelines, financing questions and comparison quotes. Without a record of where each one stands, follow-up depends on memory.",
      },
      {
        title: "High ticket means multiple estimates",
        body: "A homeowner spending five figures gets three numbers. The roofer who stays in polite contact and answers questions in writing is remembered; the other two are not.",
      },
      {
        title: "Referrals and neighbours go unworked",
        body: "One completed roof on a street is the best possible advertisement for that street, yet most roofers never systematically ask the customer for a review or a referral.",
      },
    ],
    workflow: [
      {
        title: "Every lead captured with the job details attached",
        body: "Website forms, quote requests and click-to-call create a contact record with the property, the problem and the service type, so a storm week does not become an unsorted inbox.",
      },
      {
        title: "Inspections booked online by real duration",
        body: "Customers book an inspection slot using the durations you set, with overlapping appointments blocked, so your crew day stays intact.",
      },
      {
        title: "A pipeline that shows the true stage of every job",
        body: "Each job moves through stages you can see at a glance — enquiry, inspected, quoted, booked, completed — so nothing sits in limbo unnoticed.",
      },
      {
        title: "Written estimates you can see being opened",
        body: "Send the estimate as a link built from your own services and pricing, and see when the homeowner opens it, so you call when they are actually reading it.",
      },
      {
        title: "Long-cycle follow-up that keeps running",
        body: "Automated email and text follow-up continues over the weeks a roofing decision genuinely takes, instead of stopping after the day the quote went out.",
      },
      {
        title: "Reviews collected while the job is fresh",
        body: "Completed jobs trigger a one-tap review request — the visibility that decides who the next street over calls.",
      },
    ],
    whenNotUs:
      "If your business is primarily insurance restoration work driven by supplements, adjuster negotiation and carrier-specific documentation, a specialist restoration or claims platform handles that paperwork better than a lead-and-follow-up system does.",
    faqs: [
      {
        q: "Can it handle both repair calls and full replacements?",
        a: "Yes. You define each service with its own duration and pricing, so a repair inspection and a full replacement quote follow different paths through the same pipeline.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Does the follow-up sound automated?",
        a: "You set the wording. The follow-up messages are your words on a schedule, not generic templates broadcast to everyone.",
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "hvac",
    label: "HVAC",
    trade: "HVAC companies",
    metaTitle: `CRM for HVAC Contractors — Service, Installs & Maintenance | ${MONTHLY}/mo`,
    description: `A CRM for HVAC contractors covering emergency service, system replacement quotes, seasonal demand and maintenance follow-up. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "CRM for HVAC contractors",
    intro:
      "HVAC runs on two seasons of chaos and two seasons of quiet, and the businesses that grow are the ones that convert the chaos and stay in contact through the quiet. The first heat wave brings more calls than anyone can answer; the shoulder seasons are when replacement quotes and maintenance customers should be worked, and usually are not.",
    problems: [
      {
        title: "Peak season generates more leads than you can answer",
        body: "On the first hot week, calls and form submissions outnumber available hours. Anything not captured and queued is revenue that quietly evaporated.",
      },
      {
        title: "Replacement quotes are considered purchases",
        body: "A system replacement is a major spend with financing questions attached. It is decided over days and needs written follow-up, not one phone call.",
      },
      {
        title: "Maintenance customers are the most valuable and least tracked",
        body: "Recurring maintenance smooths out the year, but only if the customer list is real and reachable rather than scattered across invoices and text threads.",
      },
      {
        title: "Off-season silence loses next season's work",
        body: "The customer you repaired in July needs a replacement quote in October. If nobody reaches out, they start over with a search.",
      },
    ],
    workflow: [
      {
        title: "Peak-season leads captured, not triaged by memory",
        body: "Every form, quote request and click-to-call becomes a record with the system type, address and problem attached, so a flood week is a queue instead of a pile.",
      },
      {
        title: "Instant replies keep you in the running",
        body: "Enquiries get an immediate automatic acknowledgement with next steps, which matters most on the days you cannot pick up.",
      },
      {
        title: "Replacement quotes built from your pricing",
        body: "Send written estimates as a link built from your own equipment and service pricing, and see when they are opened.",
      },
      {
        title: "Automatic follow-up across the decision window",
        body: "Email and text follow-up keeps open replacement quotes alive through the days a homeowner takes to decide.",
      },
      {
        title: "One customer list you can actually work",
        body: "Every past customer sits in one exportable list with their job history, so seasonal outreach and maintenance reminders are possible at all.",
      },
      {
        title: "Reviews after each completed job",
        body: "Completed work triggers a one-tap review request, building the local visibility that carries you into the next season.",
      },
    ],
    whenNotUs:
      "If your operation depends on live dispatch board logistics, technician GPS routing or refrigerant and parts inventory control, keep a specialist field service platform for that and use us for the website, lead capture and follow-up layer.",
    faqs: [
      {
        q: "Can it handle maintenance plans?",
        a: "It keeps every customer and job in one place with follow-up you control, so maintenance outreach and reminders are straightforward. It is not a billing engine for recurring maintenance contracts — subscription billing for your own customers stays with your invoicing tool.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Will it work for both residential and light commercial?",
        a: "Yes. You define your own services, durations and pricing, so residential service calls and light commercial work follow their own paths.",
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "general-contractors",
    label: "General contractors",
    trade: "general contractors",
    metaTitle: `CRM for General Contractors — Leads, Bids & Follow-Up | ${MONTHLY}/mo`,
    description: `A CRM for general contractors that qualifies enquiries, tracks bids through long decisions, follows up automatically and keeps every job's history in one place. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "CRM for general contractors",
    intro:
      "For a general contractor the expensive mistake is not a missed call — it is spending a day estimating work that was never going to happen, while a serious project waits for a reply. Remodels and builds are decided over weeks by people gathering numbers, so the businesses that win are the ones that qualify early and follow up patiently.",
    problems: [
      {
        title: "Unqualified enquiries eat estimating time",
        body: "Site visits and takeoffs are expensive. Without scope, timeline and budget captured up front, the calendar fills with visits that could never convert.",
      },
      {
        title: "Bids get decided long after they are sent",
        body: "A remodel bid may sit for a month while the homeowner collects comparisons and arranges financing. A bid nobody follows up on is a bid that loses by default.",
      },
      {
        title: "Job history lives in too many places",
        body: "Scope changes agreed by text, selections agreed by phone and pricing agreed by email leave no single record when a dispute or a follow-on job comes up.",
      },
      {
        title: "Past clients are the cheapest source of work",
        body: "Kitchen clients become bathroom clients and refer neighbours, but only if the relationship is recorded and worked rather than remembered.",
      },
    ],
    workflow: [
      {
        title: "Enquiry forms that ask qualifying questions first",
        body: "Capture scope, service type, location and the customer's own description before a site visit is booked, so your estimating hours go to real projects.",
      },
      {
        title: "A visible pipeline from enquiry to completed",
        body: "Each project moves through stages you can see, so you always know which bids are outstanding and which have gone quiet.",
      },
      {
        title: "Written proposals sent as a link",
        body: "Build proposals from your own service list and pricing, send them as a link, and see when the client opens them.",
      },
      {
        title: "Follow-up that survives a long decision",
        body: "Automated email and text follow-up keeps outstanding bids in front of the client over weeks, without you setting reminders.",
      },
      {
        title: "One record per client and project",
        body: "Contact details, job details, quotes and activity live on one record, exportable at any time, so nothing depends on scrolling a text thread.",
      },
      {
        title: "Reviews and referrals asked for on purpose",
        body: "Completed projects trigger a one-tap review request, which is what makes you findable to the next homeowner searching locally.",
      },
    ],
    whenNotUs:
      "If your real bottleneck is running the build — scheduling subcontractors, tracking submittals and RFIs, managing change orders and progress billing across large commercial projects — you need a construction project management platform. We handle getting and converting the work, not managing the jobsite.",
    faqs: [
      {
        q: "Is this construction project management software?",
        a: "No, and it is worth being clear about that. This is the system that wins and converts work: website, lead capture, quoting, booking, follow-up, reviews and reporting. Jobsite management, submittals and progress billing belong in a dedicated project management tool.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Can I use my own proposal pricing and services?",
        a: "Yes. Every quote is built from the services, durations and prices you define, so nothing is sent that you did not set.",
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "landscapers",
    label: "Landscapers",
    trade: "landscaping and lawn care businesses",
    metaTitle: `CRM for Landscaping Business — Quotes, Routes & Repeat Work | ${MONTHLY}/mo`,
    description: `A CRM for a landscaping business: capture design and maintenance enquiries, quote by property, book recurring visits and keep customers year after year. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "CRM for a landscaping business",
    intro:
      "Landscaping is two revenue models sharing one truck: one-off design and installation work with real ticket sizes, and recurring maintenance that pays the bills every week. They need opposite handling. Installs need written quotes and patient follow-up; maintenance needs a clean, reachable customer list and a renewal conversation every spring.",
    problems: [
      {
        title: "Spring demand arrives in a single burst",
        body: "The first warm weekend produces a season's worth of enquiries at once, and whatever is not captured then is gone for the year.",
      },
      {
        title: "Design and install quotes need real follow-up",
        body: "A patio or full landscape design is a considered purchase compared against other quotes, and it is usually decided well after the first conversation.",
      },
      {
        title: "Maintenance customers churn quietly",
        body: "Recurring customers rarely cancel loudly — they simply are not resigned in spring, because nobody reached out at the right moment.",
      },
      {
        title: "Quoting by property is guesswork without records",
        body: "Without the property details and history on one record, every repeat quote starts from scratch and pricing drifts.",
      },
    ],
    workflow: [
      {
        title: "Every enquiry captured with property details",
        body: "Forms and quote requests create a record with the address, service type and the customer's description, so the spring rush becomes a working queue.",
      },
      {
        title: "Separate paths for installs and maintenance",
        body: "You define each service with its own duration and pricing, so a design consultation and a weekly cut are never treated the same way.",
      },
      {
        title: "Written quotes from your own pricing",
        body: "Send install and design quotes as a link built from your service list, and see when the customer opens them.",
      },
      {
        title: "Automatic follow-up on open quotes",
        body: "Email and text follow-up keeps unanswered install quotes moving through the days a homeowner takes to decide.",
      },
      {
        title: "Bookings that respect real job length",
        body: "Online booking uses your per-service durations and blocks overlaps, so the crew day stays realistic.",
      },
      {
        title: "A customer list built for next season",
        body: "Every customer and job stays in one exportable list, so spring renewal outreach and review requests are actually possible.",
      },
    ],
    whenNotUs:
      "If your central problem is daily route optimisation and crew clock-in across dozens of properties, a specialist lawn-care routing and time-tracking tool solves that specific job better; use us for the website, quoting, lead capture and retention side.",
    faqs: [
      {
        q: "Can it handle recurring maintenance customers?",
        a: "It keeps every customer, property and job in one place with follow-up you control, which is what renewals and reminders need. Recurring billing of your own customers stays with your invoicing tool.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Does it work for a one or two crew business?",
        a: "Yes, and that is who it is built for. Setup is done for you, so a small crew is not asked to configure software.",
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "construction",
    label: "Construction",
    trade: "construction companies",
    metaTitle: `Construction CRM Software — Leads, Bids & Client Follow-Up | ${MONTHLY}/mo`,
    description: `Construction CRM software focused on winning work: qualified enquiries, written bids, automatic follow-up, one client record and reviews. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "Construction CRM software",
    intro:
      "Most software sold to construction companies manages work you already won — schedules, submittals, change orders, billing. Very little of it helps you win the next job. This page is about the other half: where enquiries come from, how fast they get a reply, whether the bid gets followed up, and whether the client comes back.",
    problems: [
      {
        title: "Winning work is treated as unmanaged",
        body: "Project delivery gets a system while enquiries live in an inbox and a phone. The pipeline that determines next quarter's revenue is the least organised part of the business.",
      },
      {
        title: "Bids go out and then go silent",
        body: "Long decision cycles mean a bid sent and forgotten is normal. The competitor who checks in politely twice is the one who gets the call.",
      },
      {
        title: "Website enquiries are not qualified",
        body: "A form asking only for a name and message produces site visits that were never going to convert, at real cost in estimating time.",
      },
      {
        title: "There is no reliable client history",
        body: "Repeat and referral work depends on a record of who you served, what you built and what it cost — not on whoever happens to remember.",
      },
    ],
    workflow: [
      {
        title: "A website built to qualify, not just exist",
        body: "Service pages and enquiry forms capture scope, service type and location up front, so the leads reaching you carry enough detail to judge.",
      },
      {
        title: "Instant acknowledgement of every enquiry",
        body: "Each enquiry gets an immediate automatic reply with next steps, so a serious client is not left wondering whether the message arrived.",
      },
      {
        title: "One pipeline for every open bid",
        body: "Enquiry, quoted, booked, completed — every job's stage is visible, so nothing outstanding is invisible.",
      },
      {
        title: "Bids sent as trackable links",
        body: "Proposals are built from your own services and pricing and sent as a link you can see being opened.",
      },
      {
        title: "Follow-up that runs for weeks, automatically",
        body: "Email and text follow-up continues across a realistic construction decision window without anyone setting reminders.",
      },
      {
        title: "Reviews and reporting that show what works",
        body: "Completed jobs trigger review requests, and the reporting shows where leads came from, so marketing decisions stop being guesses.",
      },
    ],
    whenNotUs:
      "If you are looking for project management — scheduling subs, submittals, RFIs, change orders, progress billing, daily logs — buy a construction project management platform. This system covers getting and converting work, and says so plainly rather than pretending to do both.",
    faqs: [
      {
        q: "Is this the same as construction project management software?",
        a: "No. Project management software runs the jobs you already have. This runs the work of getting jobs: website, lead capture, quoting, booking, follow-up, reviews and reporting. Many companies run both.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "How long until it is live?",
        a: `Onboarding builds your site from your real services, service area and pricing rather than starting with a blank page, and you get ${GROWTH_SYSTEM.fullAccessWindow} of full access to the whole system while it is set up.`,
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
  {
    slug: "home-service-businesses",
    label: "Home services",
    trade: "home service businesses",
    metaTitle: `CRM for Home Service Businesses — Leads to Booked Jobs | ${MONTHLY}/mo`,
    description: `A CRM for home service businesses that turns website enquiries into booked jobs: instant replies, quotes, booking, follow-up and reviews in one system. ${SETUP} setup, first month free, then ${MONTHLY}/month.`,
    heading: "CRM for home service businesses",
    intro:
      "Cleaning, pest control, painting, flooring, garage doors, pressure washing — different trades, one identical failure. A customer enquires, nobody replies for hours, and they book whoever answered first. Everything else in home services marketing is secondary to closing that gap, and no amount of extra traffic fixes it.",
    problems: [
      {
        title: "Reply speed decides most jobs",
        body: "Home service buyers contact two or three businesses and book the first credible reply. Being better and slower still loses.",
      },
      {
        title: "Enquiries arrive while you are working",
        body: "You are on a job when the lead lands, which is exactly why an unattended inbox costs money every week.",
      },
      {
        title: "Quotes given verbally are forgotten",
        body: "A number said over the phone cannot be reread, forwarded to a partner or compared. A written quote can.",
      },
      {
        title: "Nobody asks for the review",
        body: "Local visibility runs on recent reviews, and the reason most home service businesses have few is simply that no one asks.",
      },
    ],
    workflow: [
      {
        title: "Instant reply to every enquiry, day or night",
        body: "Every form and quote request gets an immediate automatic acknowledgement with next steps, so you stay in the running while you are on a job.",
      },
      {
        title: "One place where every lead lands",
        body: "Forms, quote requests and click-to-call all create a contact record with the job details attached — nothing lives only in a text thread.",
      },
      {
        title: "Instant quotes for standard services",
        body: "Where your pricing is predictable, customers can get a written estimate immediately from the rules you set, instead of waiting for a callback.",
      },
      {
        title: "Online booking that fits your day",
        body: "Customers book real slots using your per-service durations, with overlaps blocked automatically.",
      },
      {
        title: "Follow-up that does not depend on you",
        body: "Unanswered quotes get automatic email and text follow-up on a schedule, which is where most recovered revenue comes from.",
      },
      {
        title: "Reviews requested after every completed job",
        body: "A one-tap review request goes out when work is finished, feeding the local visibility that brings the next enquiry.",
      },
    ],
    whenNotUs:
      "If you only need a booking widget bolted onto a website you are happy with, a single-purpose scheduling tool is cheaper than a full system. This is for owners who want the website, CRM, quoting, follow-up and reviews handled together.",
    faqs: [
      {
        q: "My trade is not listed. Does it still work?",
        a: "Yes. The services, durations, pricing and service area are all yours to define, and onboarding builds the site around them, so the trade matters less than the workflow — enquiry, quote, booking, follow-up, review.",
      },
      {
        q: "How much does it cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Do I have to set it up myself?",
        a: `No. Setup is what the ${SETUP} covers: the site is generated from your real services, area and pricing, then configured and launched for you.`,
      },
      {
        q: "Do I own the website and the customer data?",
        a: OWNERSHIP_ANSWER,
      },
    ],
  },
] as const;

export function findCrmSolution(slug: string): CrmSolution | null {
  return CRM_SOLUTIONS.find((s) => s.slug === slug) ?? null;
}

export function crmSolutionPaths(): string[] {
  return ["/crm", ...CRM_SOLUTIONS.map((s) => `/crm/${s.slug}`)];
}
