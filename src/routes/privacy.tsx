import { createFileRoute } from "@tanstack/react-router";
import { clientDomainLegalRedirect } from "@/lib/tenant-page-utils";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { REVORA } from "@/lib/brand";
import { LEGAL, operatorStatement } from "@/lib/legal";
import { breadcrumbSchema, canonicalLink, jsonLdScript, ogUrl, OG_IMAGE_META } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  // On a client's own domain this is not Revora's policy page (tenant-page-utils.ts).
  beforeLoad: () => clientDomainLegalRedirect("privacy"),
  head: () => ({
    meta: [
      { title: "Privacy Policy | Revora Growth Systems" },
      {
        name: "description",
        content:
          "How Revora Growth Systems collects, uses, stores and protects information for platform accounts, client workspaces and the websites we build and manage.",
      },
      { property: "og:title", content: "Revora Growth Systems privacy policy" },
      {
        property: "og:description",
        content: "What data Revora collects, how it's used, how long it's kept and your choices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      ogUrl("/privacy"),
      ...OG_IMAGE_META,
    ],
    links: [canonicalLink("/privacy")],
    scripts: [
      jsonLdScript(
        breadcrumbSchema([
          { name: "Revora", path: "/" },
          { name: "Privacy policy", path: "/privacy" },
        ]),
      ),
    ],
  }),
  component: PrivacyPage,
});

/*
 * REVIEW WITH A LAWYER BEFORE RELYING ON THIS.
 * Plain description of what the code does today (vendors, cookies, retention,
 * deletion). Keep it in step with the code: if a vendor, tracker or retention
 * rule changes, change this page and bump LEGAL.privacyLastUpdated.
 */
const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "Who we are",
    body: [
      `Revora Growth Systems ("Revora", "we") builds and manages websites and customer acquisition systems for local service businesses. ${operatorStatement()}`,
      `Questions about this policy or your information: ${REVORA.email}.`,
    ],
  },
  {
    heading: "Information we collect",
    body: [
      "Account information you provide: name, business name, email, phone and login credentials (passwords are stored only as salted hashes by our authentication provider).",
      "Business content you add to your workspace: services, pricing, hours, service areas, photos, website content and settings.",
      "Customer records your workspace collects: leads, quote requests, appointments, messages and reviews submitted through your Revora site and forms.",
      "Usage and technical data on our own marketing site and app: pages viewed, actions taken, device and browser information, IP address and approximate location, plus attribution details such as referrer and UTM parameters.",
      "Assessment and audit submissions: the answers and email address you enter into our free Growth Assessment or Website Audit forms.",
      "Billing data: subscription and payment status. Card details are collected and stored by our payment processor, Stripe; Revora never sees or stores full card numbers.",
      "Business contact details for outreach: the name, website, public email address and phone number of local businesses, taken from publicly available business listings, so we can send them a preview of a demo website.",
    ],
  },
  {
    heading: "How we use information",
    body: [
      "To create, operate and support your workspace, website and automations.",
      "To send transactional messages: account, billing, lead alerts, booking confirmations, review requests and onboarding guidance.",
      "To send occasional product and growth emails. Every marketing email includes an unsubscribe link; transactional messages continue while your account is active.",
      "To generate website copy and images with AI models (see Service providers).",
      "To measure and improve our own marketing site, including A/B tests of layout and copy.",
      "To protect the platform: fraud prevention, abuse detection, rate limiting and error monitoring.",
      "We do not sell your personal information, and we do not use your customer records to market to your customers on our own behalf.",
    ],
  },
  {
    heading: "Legal bases (visitors in the EEA, UK and Switzerland)",
    body: [
      "Our services are aimed at US businesses, but our websites are public. Where the GDPR or UK GDPR applies, we rely on: performance of a contract (running your account and website), legitimate interests (securing the platform, improving the product, and contacting businesses about our service), consent (analytics and advertising cookies, which in those regions load only after you accept), and legal obligations (tax and accounting records).",
    ],
  },
  {
    heading: "Business outreach",
    body: [
      'We may email or text a business to share a free demo website we built for it. Every outreach email names Revora, includes our mailing address and has a one-click unsubscribe link. Every text names Revora and ends with "Reply STOP to opt out." Unsubscribes and STOP replies go on a do-not-contact list that every later send checks first.',
      `To stop all contact, use the unsubscribe link, reply STOP, or email ${REVORA.email}.`,
    ],
  },
  {
    heading: "Your customers' data",
    body: [
      "Leads, bookings, quotes and reviews collected through your Revora site belong to your business. You are responsible for that data; Revora processes it on your instructions to run the system.",
      "Workspace data is isolated per client. Access is limited to your invited members, and to Revora staff only where necessary for support, security or billing.",
    ],
  },
  {
    heading: "Service providers",
    body: [
      "We share information only with the providers we use to run the service, and only what each one needs:",
      "Hosting, database, authentication and managed email: Supabase via Lovable Cloud. Network, caching and security: Cloudflare.",
      "Payments: Stripe. Email forwarding for our own mailbox: ImprovMX. Outreach email: Google (Gmail). Text messages, when enabled: Twilio.",
      "AI content generation: requests go through the Lovable AI gateway to models from Google (Gemini), OpenAI and Anthropic. The business details and prompts needed to write or design a page are sent; we do not send card data or passwords. Web research for the internal assistant: Perplexity. Voice replies for the internal assistant: ElevenLabs.",
      "Error monitoring: Sentry, when configured, receives error reports that can include the page address and browser details.",
      "Analytics and advertising measurement on our own marketing site: Google Analytics 4, Google Ads conversion measurement and Microsoft Clarity (heatmaps and session replay with masking). See Cookies below.",
      "Maps and fonts on websites we publish for clients: Google Maps (an embedded map, when the business adds its Maps link) and Google Fonts. Loading these sends the visitor's IP address and browser details to Google.",
      "Stock photos and videos: Pexels and Unsplash. These receive search terms, not personal information.",
      "We may also disclose information if required by law, or to a successor if the business is sold or reorganised.",
    ],
  },
  {
    heading: "Cookies and analytics",
    body: [
      "On our own marketing pages we use Google Analytics 4, Google Ads conversion measurement and Microsoft Clarity. They do not run inside the app or admin area, or on websites we publish for clients.",
      "In the European Economic Area, the United Kingdom, Switzerland and Canada (and when we cannot tell where you are), these tools load only after you click Accept in the cookie banner. If you reject, they are not loaded.",
      'Elsewhere they load by default, unless your browser sends a Global Privacy Control signal, which we treat as an opt-out until you click Accept yourself. You can switch them off at any time with the "Cookie settings" link in the site footer. Your choice is stored in your browser until you change it.',
      "Separately, our site keeps a random visitor ID and the page you first landed on in your browser's storage so we can count visits and signups in our own reporting. It is not derived from your IP address or device details. It follows the same choice as the cookies above: in the regions where we ask first it is only created after you click Accept, and elsewhere it is created unless your browser sends Global Privacy Control. If your browser sends Global Privacy Control, it is not created unless you click Accept. Clicking Reject stops it and deletes an existing one.",
    ],
  },
  {
    heading: "Retention",
    body: [
      "Workspace and customer data is kept while your account is active.",
      "If you cancel, your published site stays online for 14 days after your paid period ends and then goes offline. Your workspace data is not automatically deleted at that point, so you can reactivate. We do not yet run automatic deletion of closed accounts; data is kept until you ask us to delete it.",
      "Records needed for tax, accounting or legal purposes (for example Stripe billing records) are kept as long as the law requires. The do-not-contact list is kept indefinitely so we never contact someone who opted out.",
    ],
  },
  {
    heading: "Your choices and rights",
    body: [
      "You can view and correct your workspace data in the app, and export your leads as a CSV file from the Leads page. You can unsubscribe from marketing email at any time.",
      `To ask for a copy of your data or for deletion of your account and its data, email ${REVORA.email} from the address on your account, or use the request buttons under Settings → Your data in the app. We confirm the request with that address before acting and tell you when it is done. Billing records we must keep by law are retained.`,
      "Depending on where you live you may also have rights to object to or restrict processing, or to complain to your local data protection authority.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is encrypted in transit, access is scoped per workspace with row-level database policies, privileged operations run server-side only, and administrative access is limited. No system is perfectly secure, so please use a strong, unique password.",
      "If we learn of a security breach that affects your personal information, we will notify affected users and the authorities as applicable law requires.",
    ],
  },
  {
    heading: "International visitors",
    body: [
      "Revora is run from the United States and our providers may process data in the United States and other countries.",
    ],
  },
  {
    heading: "Children",
    body: ["Revora is a business tool and is not directed to anyone under 18."],
  },
  {
    heading: "Changes",
    body: [
      "We will update this page when our practices change and, for material changes, notify account holders by email.",
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="border-b border-border">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <p className="eyebrow">Legal</p>
            <h1 className="mt-2 font-editorial text-balance text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
              Privacy Policy
            </h1>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Last updated {LEGAL.privacyLastUpdated}
            </p>
            <div className="mt-10 space-y-9">
              {SECTIONS.map((section) => (
                <section key={section.heading}>
                  <h2 className="font-display text-[17px] font-semibold">{section.heading}</h2>
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 40)}
                      className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
