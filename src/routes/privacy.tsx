import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { REVORA } from "@/lib/brand";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
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
    ],
    links: [canonicalLink("/privacy")],
  }),
  component: PrivacyPage,
});

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "Who we are",
    body: [
      `Revora Growth Systems ("Revora", "we") builds and manages customer acquisition systems for local businesses. Questions about this policy can be sent to ${REVORA.email} or ${REVORA.phoneDisplay}.`,
    ],
  },
  {
    heading: "Information we collect",
    body: [
      "Account information you provide: name, business name, email, phone and login credentials (passwords are stored only as salted hashes by our authentication provider).",
      "Business content you add to your workspace: services, pricing, hours, service areas, media, website content and settings.",
      "Customer records your workspace collects: leads, quote requests, appointments, messages and reviews submitted through your Revora site and forms.",
      "Usage and technical data: pages viewed, actions taken in the app, device and browser information, IP address and approximate location, plus attribution details such as referrer and UTM parameters.",
      "Assessment and audit submissions: the answers and email address you enter into our free Growth Assessment or Website Audit forms.",
      "Billing data: subscription and payment status. Card details are processed and stored by our payment processor, Stripe — Revora never stores full card numbers.",
    ],
  },
  {
    heading: "How we use information",
    body: [
      "To create, operate and support your workspace, website and automations.",
      "To send transactional messages: account, billing, lead alerts, booking confirmations, review requests and onboarding guidance.",
      "To send occasional product and growth emails. Every marketing email includes an unsubscribe link; transactional messages continue while your account is active.",
      "To measure and improve conversion across our own marketing site, including A/B tests of layout and copy.",
      "To protect the platform: fraud prevention, abuse detection, rate limiting and security monitoring.",
      "We do not sell your personal information, and we do not use your customer records to market to your customers on our own behalf.",
    ],
  },
  {
    heading: "Your customers' data",
    body: [
      "Leads, bookings, quotes and reviews collected through your Revora site belong to your business. You are the controller of that data; Revora processes it on your instructions to run the system.",
      "Workspace data is isolated per client. Access is limited to your invited members, and to Revora staff only where necessary for support, security or billing.",
    ],
  },
  {
    heading: "Service providers",
    body: [
      "We use vetted providers to deliver the platform: cloud hosting and database, authentication, email delivery, AI content generation, analytics and payment processing (Stripe). Providers receive only what they need to perform their function.",
    ],
  },
  {
    heading: "Retention",
    body: [
      "Workspace and customer data is retained while your account is active. After cancellation we retain data for a limited wind-down period so you can export or reactivate, then delete or anonymize it. Records required for tax, accounting or legal purposes are kept as long as the law requires.",
    ],
  },
  {
    heading: "Your choices and rights",
    body: [
      "You can access, correct or export your workspace data from inside the app, unsubscribe from marketing email at any time, and request deletion of your account and associated data.",
      `To make a request, email ${REVORA.email} from the address on your account. Depending on where you live you may also have rights to object to or restrict processing, or to lodge a complaint with your local data protection authority.`,
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is encrypted in transit, access is scoped per workspace with row-level database policies, privileged operations run server-side only, and administrative access is limited and logged. No system is perfectly secure, so please use a strong, unique password.",
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
            <h1 className="mt-2 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight font-semibold">
              Privacy Policy
            </h1>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Last updated{" "}
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
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
