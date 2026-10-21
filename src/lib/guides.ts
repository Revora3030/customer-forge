/**
 * Free guides.
 *
 * These are genuinely useful, verifiable how-tos for local business owners.
 * They exist to earn organic and AI-search traffic on informational queries,
 * and they only contain advice that is true independently of Revora — no
 * invented statistics, no fake case studies, no promised rankings.
 */

import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";

const MONTHLY = usdExact(GROWTH_SYSTEM.monthlyPrice);

export interface GuideStep {
  title: string;
  body: string;
}

export interface Guide {
  slug: string;
  title: string;
  /** Search-facing page title. */
  metaTitle: string;
  description: string;
  intro: string;
  readMinutes: number;
  steps: readonly GuideStep[];
  takeaway: string;
  faqs: readonly { q: string; a: string }[];
  sources?: readonly { label: string; url: string }[];
}

export const GUIDES: readonly Guide[] = [
  {
    slug: "boost-local-service-business-with-online-reviews",
    title: "Boost Your Local Service Business with Online Reviews",
    metaTitle: "Harness Online Reviews for Local Service Business Success",
    description:
      "Learn how to leverage online reviews to grow your local service business effectively.",
    intro:
      "Online reviews are essential for local service businesses aiming to build trust and attract more customers. Learn how to effectively manage and utilize reviews to your advantage.",
    readMinutes: 6,
    steps: [
      {
        title: "Understand the Importance of Reviews",
        body: "Online reviews significantly influence consumer decisions. Customers often trust reviews as much as personal recommendations. Understanding this can help businesses prioritize review management as a crucial part of their marketing strategy.",
      },
      {
        title: "Claim and Optimize Your Listings",
        body: "Ensure your business is listed on major review platforms like Google My Business, Yelp, and Facebook. Fill out profiles completely, and use high-quality images to make your business stand out. Respond to both positive and negative reviews to show engagement and build trust.",
      },
      {
        title: "Encourage More Customer Reviews",
        body: "Invite every customer with a genuine experience to leave an honest review using the same neutral process. Share a direct review link by email, a thank-you card or in person. Do not select only satisfied customers, offer rewards or request a particular rating.",
      },
      {
        title: "Respond to Reviews Effectively",
        body: "Respond to all reviews promptly and professionally. Thank customers for positive feedback and address any issues raised in negative reviews with solutions. This shows your commitment to customer satisfaction and can improve your reputation.",
      },
      {
        title: "Leverage Reviews in Marketing",
        body: "Feature positive reviews on your website and social media profiles. Highlight customer testimonials in marketing materials like brochures or ads. This not only builds credibility but also assures potential customers of your quality.",
      },
      {
        title: "Integrate Reviews in Local SEO Strategy",
        body: "Google says review count and positive ratings can help local prominence. Invite customers to describe their own genuine experience without coaching keywords or ratings. Keep your business information accurate; reviews do not guarantee a ranking.",
      },
      {
        title: "Use Feedback to Improve Services",
        body: "Analyze your reviews to identify patterns in customer feedback. Use this information to improve your services, address recurring issues, and enhance customer satisfaction. Continuous improvement based on actual customer feedback can set your business apart from the competition.",
      },
    ],
    takeaway:
      "Managing online reviews effectively can significantly boost your local service business. By encouraging, responding to, and integrating reviews into your marketing strategy, you can enhance customer trust and visibility, driving growth and success.",
    faqs: [
      {
        q: "How do I get more customer reviews?",
        a: "Invite all customers with genuine experiences to leave an honest review. Use a direct link and a neutral request; never filter by satisfaction, offer incentives or ask for positive ratings.",
      },
      {
        q: "What if I receive a negative review?",
        a: "Respond promptly and professionally, addressing the issue and offering a solution. This shows potential customers you value feedback and customer satisfaction.",
      },
      {
        q: "Can reviews impact my search engine ranking?",
        a: "Google lists relevance, distance and prominence as its main local ranking factors. Review count and positive ratings can help prominence, but no review strategy guarantees visibility or a particular position.",
      },
    ],
  },
  {
    slug: "optimize-local-service-sales-process",
    title: "Optimizing Your Local Service Business Sales Process",
    metaTitle: "Optimize Local Service Sales for More Bookings",
    description:
      "Learn how to optimize your local service business sales process, from lead follow-up to booking.",
    intro:
      "Local service businesses thrive on effective sales processes. By optimizing marketing, managing reviews, and streamlining quotes, you can improve your bookings.",
    readMinutes: 6,
    steps: [
      {
        title: "Understand Your Local SEO",
        body: "Local SEO is crucial for reaching your community. Enhance your business listings on Google My Business, use local keywords, and ensure your website is mobile-friendly. Regularly update your business information and encourage customers to leave online reviews. These actions help potential customers find you more easily.",
      },
      {
        title: "Manage and Respond to Online Reviews",
        body: "Invite customers to share genuine feedback without selecting for satisfaction or asking for positive ratings. Respond professionally, address concerns and thank customers for their feedback. Do not offer incentives or divert unhappy customers away from public reviews.",
      },
      {
        title: "Create Practical Marketing Strategies",
        body: "Focus on marketing strategies that resonate with your local audience. Use social media to showcase your work, customer testimonials, and behind-the-scenes content. Collaborate with other local businesses for cross-promotions. Develop email marketing campaigns tailored to specific customer needs and preferences.",
      },
      {
        title: "Streamline Lead Follow-Up",
        body: "Timely follow-up with leads is essential to convert interest into sales. Use CRM systems to keep track of customer interactions and set reminders for follow-up actions. Personalize your communication to make customers feel valued and more likely to book your services.",
      },
      {
        title: "Optimize Quoting Processes",
        body: "Develop a transparent and efficient quoting process. Provide detailed quotes with breakdowns to help clients understand the value you offer. Consider online quoting tools to make the process quicker and more accessible. Clear quotes reduce confusion and encourage quicker decisions from potential customers.",
      },
      {
        title: "Simplify Booking Systems",
        body: "Utilize online booking systems to make it easy for customers to schedule appointments. Clearly display your availability and offer flexible booking options. Allow adjustments and cancellations to be handled with minimal hassle. This convenience increases the likelihood of securing bookings.",
      },
      {
        title: "Leverage Customer Feedback for Improvement",
        body: "Regularly gather feedback from your clients to understand their needs and preferences. Use surveys or suggestion boxes to gain insights. Make improvements based on this feedback to enhance your services. Showing customers that you value their opinion fosters loyalty and repeat business.",
      },
    ],
    takeaway:
      "Optimizing your sales process involves a blend of effective marketing, reputation management, and streamlined operations. By focusing on customer expectations and using tools to enhance your processes, you can significantly boost your bookings and customer satisfaction.",
    faqs: [
      {
        q: "How important are online reviews for my local service business?",
        a: "Online reviews are very important as they influence potential customers' perceptions and decision-making. Positive reviews build trust and attract more clients.",
      },
      {
        q: "What tools can help with lead follow-up?",
        a: "CRM systems are effective for managing lead follow-up by organizing customer interactions and setting reminders for timely follow-up communication.",
      },
      {
        q: "Why should I use an online booking system?",
        a: "Online booking systems provide convenience for customers, allowing them to easily view availability and schedule services, which can lead to more bookings.",
      },
    ],
  },
  {
    slug: "get-more-google-reviews",
    title: "How to get more Google reviews (without being weird about it)",
    metaTitle: "How to Get More Google Reviews | Revora Guide",
    description:
      "A practical, policy-safe process for local businesses to earn more Google reviews: when to ask, exactly what to say, how to make it one tap, and how to handle a bad one.",
    intro:
      "Reviews are the cheapest competitive advantage a local business has, and almost every business under-collects them for the same reason: asking is awkward and easy to forget. The fix is a repeatable process, not more courage.",
    readMinutes: 5,
    steps: [
      {
        title: "Ask consistently after a genuine customer experience",
        body: "Use the same neutral request after a completed service or genuine interaction, regardless of whether the customer sounded satisfied. Ask for honest feedback, not a positive rating. A customer should never need to pass a satisfaction screen to receive your Google review link.",
      },
      {
        title: "Make it one tap, never a search",
        body: "Send the direct Google review link by text. Every extra step — open Maps, find the business, scroll, tap stars — loses people. If they have to look you up, most will not.",
      },
      {
        title: "Use a short, human script",
        body: "\"Really glad you're happy with it. If you have 30 seconds, a quick Google review helps a lot — here's the link.\" That is enough. Long requests read like marketing and get ignored.",
      },
      {
        title: "Never offer anything in exchange",
        body: "Discounts, entries and gifts for reviews violate Google's policies and can get reviews removed or your profile penalised. Ask everyone, incentivise no one.",
      },
      {
        title: "Automate the reminder, not the review",
        body: "Use a completed-job trigger and one polite reminder where the customer has permitted messages. Apply the same process to all customers and respect opt-outs. Automation can make requests consistent; it cannot guarantee review counts or write reviews for customers.",
      },
      {
        title: "Answer every review, especially the bad one",
        body: "Reply to positives briefly and specifically. For a negative, respond once, publicly, calmly: acknowledge, state what you are doing about it, and move the detail to a phone call. Future customers are reading how you handle problems, not whether you ever had one.",
      },
      {
        title: "Keep public reviews and private feedback equally available",
        body: "Offer private feedback separately without screening, delaying or hiding the public review link. Do not send unhappy customers only to a private form while directing satisfied customers to Google. Everyone must receive the same opportunity to leave a public review.",
      },
    ],
    takeaway:
      "A responsible review workflow uses a genuine customer experience, a direct link and a neutral request. Configure reminders with consent and opt-outs, never offer incentives and never filter customers by satisfaction.",
    sources: [{ label: "Google: tips to get more reviews", url: "https://support.google.com/business/answer/3474122?hl=en" }],
    faqs: [
      {
        q: "How many reviews do I need?",
        a: "There is no threshold that guarantees anything. What matters competitively is having more recent, more specific reviews than the businesses you appear next to in local results.",
      },
      {
        q: "Can I remove a bad review?",
        a: "Only if it violates Google's policies (spam, conflict of interest, off-topic, hate speech) — you can report it, but a genuine unhappy customer's review will stay. Answering it well is the real remedy.",
      },
    ],
  },
  {
    slug: "show-up-in-google-map-pack",
    title: "How to show up in the Google map pack for your city",
    metaTitle: "Google Map Pack: Local SEO Checklist | Revora",
    description:
      "The concrete, non-mysterious work behind local map results: profile completeness, service and city pages, structured data, reviews, proximity and consistency.",
    intro:
      "Google identifies relevance, distance and prominence as its main local ranking factors. Start with accurate business information, useful service content and genuine customer reviews. These practices support discovery but cannot guarantee a place in the map pack.",
    readMinutes: 6,
    steps: [
      {
        title: "Complete your Google Business Profile properly",
        body: "Choose categories that describe your real business. Supply accurate services, service areas, opening hours, contact details, website and original photos. Google recommends complete and accurate information; that does not guarantee you will outrank another business.",
      },
      {
        title: "Match your website to what the profile claims",
        body: "If your profile says water heater installation, there should be a page about water heater installation. Relevance is judged on your site's content, not only on your profile categories.",
      },
      {
        title: "Give every real service its own page",
        body: "Create a separate service page when it answers a distinct customer question with useful detail: scope, approved pricing, requirements and next steps. Combining closely related services can be appropriate. Page count alone is not a ranking strategy.",
      },
      {
        title: "Build genuine city and service-area pages",
        body: "A page per place you actually work, with real content about working there: neighbourhoods, common property types, travel notes, local jobs you do. Do not spin out fifty near-identical pages for towns you will not drive to; that is what gets ignored or filtered.",
      },
      {
        title: "Add structured data",
        body: "LocalBusiness or the specific business type, plus Service and Breadcrumb markup, tells search engines and AI assistants your name, phone, area served and offers in machine-readable form. It does not buy a ranking; it removes ambiguity.",
      },
      {
        title: "Be consistent everywhere",
        body: "Identical business name, phone number and address across your site, Google, Bing Places, Apple Business Connect, Facebook and any directory listing you have. Inconsistency is one of the few purely self-inflicted local ranking problems.",
      },
      {
        title: "Invite genuine reviews and respond professionally",
        body: "Google says review count and positive ratings can help prominence. Ask all customers for honest feedback on the same terms and respond constructively. Do not buy reviews or promise a ranking effect from a specific review count or schedule.",
      },
      {
        title: "Make the site fast on a phone",
        body: "Local searches are overwhelmingly mobile. A page that takes five seconds loses the customer before ranking matters at all.",
      },
    ],
    takeaway:
      "Local ranking is completeness, relevance and prominence, done consistently. Revora ships the site-side half of that list by default — service pages, real service-area pages, structured data, speed and the review engine.",
    sources: [{ label: "Google: improve your local ranking", url: "https://support.google.com/business/answer/7091?hl=en" }, { label: "Google: tips to get more reviews", url: "https://support.google.com/business/answer/3474122?hl=en" }],
    faqs: [
      {
        q: "How long does local SEO take?",
        a: "Profile and consistency fixes can show up in weeks; content and review prominence compound over months. Anyone promising a specific position by a specific date is guessing.",
      },
      {
        q: "Do I need a physical address?",
        a: "No. Service-area businesses can hide the address and list the areas they serve. What you cannot do is invent a location you do not operate from.",
      },
    ],
  },
  {
    slug: "respond-to-leads-faster",
    title: "Why speed to lead decides who wins the job",
    metaTitle: "Automated Lead Follow-Up for Businesses | Revora Guide",
    description:
      "How to reply to every enquiry within minutes without living on your phone: instant first replies, quote ranges, one pipeline, and a follow-up sequence that finishes the conversation.",
    intro:
      "A clear, timely response helps customers understand what happens next. Automated lead follow-up can acknowledge an enquiry, collect missing details and remind your team to respond, without promising that a fast reply alone will win the job.",
    readMinutes: 4,
    steps: [
      {
        title: "Send an instant first reply, automatically",
        body: "The first message does not have to be a quote. Confirm what you received, give a response window your team can actually meet and explain what the customer can do meanwhile. Identify automated messages honestly; never imply someone has personally reviewed an enquiry when they have not.",
      },
      {
        title: "Give a price range before a site visit",
        body: "Most customers are not asking for a final number, they are checking whether you are in their universe. A structured quote form that returns a range filters out the wrong jobs and warms the right ones.",
      },
      {
        title: "Put every channel in one place",
        body: "Calls, form fills, texts, DMs and bookings should land in one pipeline. Leads are lost in the gaps between apps far more often than they are lost to competitors.",
      },
      {
        title: "Follow up on a schedule, not on a mood",
        body: "A quote that gets one reply attempt is a quote you gave away. Two or three spaced follow-ups over a week, then a final polite close, converts jobs that were never lost — just forgotten.",
      },
      {
        title: "Track which channel produces paying customers",
        body: "Not clicks, not impressions — booked jobs. Once you can see that, you stop funding the channel that only produces traffic.",
      },
    ],
    takeaway:
      "A useful follow-up workflow combines a clear acknowledgement, an assigned next action and a respectful reminder schedule. Configure the channels your business actually connects, honor opt-outs and measure qualified enquiries and booked work rather than promising results from reply speed alone.",
    faqs: [
      {
        q: "Is an automatic reply impersonal?",
        a: 'Not if it is honest and specific. Customers accept "we\'ve got your request and will text you a range within the hour" far better than silence.',
      },
      {
        q: "What if I cannot answer for hours?",
        a: `That is exactly the case this solves. The system covers the gap and holds the lead until you can. It costs ${MONTHLY}/month and never sleeps.`,
      },
    ],
  },
  {
    slug: "price-your-services",
    title: "How to publish prices without losing money",
    metaTitle:
      "How to price and publish local service prices — starting-at ranges that qualify buyers",
    description:
      "A practical approach to showing prices on a local service website: starting-at ranges, factor-based quoting, what never to publish, and how pricing filters bad jobs.",
    intro:
      '"Call for a quote" costs you the customers who were ready to buy and only wanted to know if you were in range. Publishing something — not everything — is almost always more profitable than publishing nothing.',
    readMinutes: 5,
    steps: [
      {
        title: "Publish a floor, not a ceiling",
        body: "A starting-at price sets expectations and removes the customers hunting for the cheapest possible option. It does not commit you to a number for a job you have not seen.",
      },
      {
        title: "Price on factors you can ask about",
        body: "Square footage, vehicle size, bedrooms, roof pitch, system age, frequency. If the factor can be a question, the quote can be automated.",
      },
      {
        title: "Give a range, then explain the range",
        body: 'A range plus one sentence about what moves it ("heavier soiling and pet hair move this up") is credible. A bare number invites an argument later.',
      },
      {
        title: "Charge for the visit when the visit is the work",
        body: "For diagnostic trades, a stated service call fee filters out tyre-kickers and protects your day. Say it plainly on the page.",
      },
      {
        title: "Never publish your worst-case discount",
        body: "Whatever number is visible becomes the anchor for every negotiation. Publish the range you actually want to work in.",
      },
      {
        title: "Revisit prices on a schedule",
        body: "Costs move. Pick a quarter, review your ranges, and update the site — a quoting system that is one edit away makes this a five-minute job instead of a project.",
      },
      {
        title: "Package the common jobs so buyers can compare themselves",
        body: "Most local businesses sell the same three or four jobs over and over. Give each one a name, a starting-at price, and a short list of exactly what is included and what is not. A buyer who can place their own job into one of your packages is a buyer who arrives already qualified, already expecting your price band, and asking to book rather than asking what it costs.",
      },
      {
        title: "Show what changes the price before the customer asks",
        body: "List the two or three factors that genuinely move your number — access, condition, size, urgency, after-hours work — with a plain sentence each. This is the same conversation you already have on the phone, done once, on the page, at 11pm while you are asleep. It prevents the awkward revision on site, because the customer read the reason for it before you arrived.",
      },
      {
        title: "Make the next step obvious next to every price",
        body: "A price with no adjacent action is a dead end. Every published range should sit beside one button that starts the instant quote or the booking, so the moment the number feels acceptable there is nothing left to do but continue. Pricing pages lose more revenue to missing buttons than to being too expensive.",
      },
    ],
    takeaway:
      "Published ranges qualify buyers before they cost you a drive. Revora's quote builder turns your factors and add-ons into an instant range and sends you the completed answers with the lead.",
    faqs: [
      {
        q: "Won't competitors see my prices?",
        a: "They already can, by requesting a quote. Their knowing your range costs you far less than the customers who left because nothing was shown.",
      },
      {
        q: "What if my jobs are too custom to price?",
        a: "Then price the entry point and the common cases, and be explicit that complex work is quoted after a visit. Something beats nothing.",
      },
      {
        q: "Should I show prices if I am the most expensive option in my area?",
        a: "Yes, and say why in the same breath: what is included, what you carry, what you guarantee, how fast you turn up. Price-shoppers were never going to be profitable customers, and buyers who care about the job being done properly need a reason to accept a higher number. Hiding the number only delays that conversation until after you have driven out.",
      },
      {
        q: "How often should published prices change?",
        a: "Review quarterly, and change immediately whenever your own costs step up — materials, insurance, fuel, labour. Small regular adjustments are absorbed without comment; one large overdue jump is the change customers argue about.",
      },
    ],
  },
  {
    slug: "local-business-website-checklist",
    title: "The local business website checklist that actually converts",
    metaTitle: "Local business website checklist — what a service site needs to convert",
    description:
      "Everything a local service website needs to turn visitors into booked jobs: above-the-fold clarity, tap-to-call, real service pages, proof, quoting, booking, speed and tracking.",
    intro:
      "Most local websites fail for boring, fixable reasons. Work down this list and fix what is missing; it is worth more than any redesign.",
    readMinutes: 6,
    steps: [
      {
        title: "Say what you do, where, in the first line",
        body: 'A visitor should know your trade and your area without scrolling. "Fast AC repair across Charlotte and the surrounding counties" beats any tagline.',
      },
      {
        title: "One obvious primary action",
        body: "Call, book or get a quote — pick the one that makes you money and make it the loudest thing on the page, repeated at the top, middle and bottom.",
      },
      {
        title: "Tap-to-call in the header on mobile",
        body: "A phone number that is not a link is a phone number nobody dials.",
      },
      {
        title: "A page per real service",
        body: "What it includes, what it starts at, how long it takes, what happens next. This is what search engines rank and what customers read.",
      },
      {
        title: "Real service-area coverage",
        body: "List the places you genuinely work and say plainly whether you travel. Vague coverage loses customers who assumed you were too far away.",
      },
      {
        title: "Proof that is yours",
        body: "Your photos, your reviews, your licence and insurance details. Stock imagery and generic badges reduce trust rather than build it.",
      },
      {
        title: "A quote path that works without a phone call",
        body: "Structured questions, a real range, and a lead that arrives complete.",
      },
      {
        title: "Booking against real availability",
        body: "If a customer can book while you are on a job, you stop losing the ones who will not wait for a callback.",
      },
      {
        title: "Speed and mobile layout",
        body: "Compressed images, no layout shift, buttons big enough for a thumb. Test it on your own phone on mobile data, not on office wifi.",
      },
      {
        title: "Tracking that ties leads to sources",
        body: "You need to know which page and channel produced booked work, otherwise every marketing decision is a guess.",
      },
      {
        title: "The boring essentials",
        body: "HTTPS, a sitemap, correct business structured data, an indexable site, and a 404 page that sends people somewhere useful.",
      },
    ],
    takeaway:
      "This checklist is exactly what Revora generates by default — including quoting, booking, CRM, follow-up, reviews, structured data and attribution — instead of leaving it as homework.",
    faqs: [
      {
        q: "Do I need a blog?",
        a: "Not to start. Service pages, service-area pages and reviews produce more local revenue per hour of effort than a blog does. Add helpful content later, once the money pages exist.",
      },
      {
        q: "How many pages should a local site have?",
        a: "As many as you have real services and real places, plus about, contact, pricing and proof. Fewer than that leaves searches uncovered; padding with thin pages does not help.",
      },
    ],
  },
] as const;

export function findGuide(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

export function guidePaths(): string[] {
  return ["/guides", ...GUIDES.map((g) => `/guides/${g.slug}`)];
}
