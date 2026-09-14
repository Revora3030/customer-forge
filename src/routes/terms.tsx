import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { REVORA } from "@/lib/brand";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Revora Growth Systems" },
      {
        name: "description",
        content:
          "Revora Growth Systems terms of service: free trial, $750 setup, $100/month platform fee, first month free, cancellation, data ownership, acceptable use and support commitments.",
      },
      { property: "og:title", content: "Revora Growth Systems terms of service" },
      {
        property: "og:description",
        content:
          "The agreement covering your Revora workspace, billing, cancellation, data ownership and acceptable use.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      ogUrl("/terms"),
    ],
    links: [canonicalLink("/terms")],
  }),
  component: TermsPage,
});

function TermsPage() {
  const SECTIONS: { heading: string; body: string[] }[] = [
    {
      heading: "The agreement",
      body: [
        `These terms govern your use of the Revora Growth Systems platform and the services we provide. By creating an account you agree to them. Questions: ${REVORA.email} or ${REVORA.phoneDisplay}.`,
      ],
    },
    {
      heading: "Free access trial",
      body: [
        `New accounts receive ${GROWTH_SYSTEM.fullAccessTrialDays} days of full platform access at no cost and with no card required. The trial begins when your workspace is created and ends automatically. When it ends, continued access requires the ${usd(GROWTH_SYSTEM.setupPrice)} setup payment.`,
      ],
    },
    {
      heading: "Fees and billing",
      body: [
        `${usd(GROWTH_SYSTEM.setupPrice)} one-time setup covers implementation, customization and launch of your system. It is charged when you choose to proceed after (or during) the trial.`,
        `The platform fee is ${usd(GROWTH_SYSTEM.monthlyPrice)}/month. Your first month is free: the first monthly charge occurs 30 days after setup (month two) and recurs monthly until canceled.`,
        "Payments are processed by Stripe. Taxes, if applicable, are added at checkout. Failed payments may suspend access until resolved.",
      ],
    },
    {
      heading: "Cancellation and refunds",
      body: [
        "You can cancel the monthly subscription at any time from billing settings; access continues to the end of the paid period and no further charges are made.",
        "The setup fee covers work performed to build, configure and launch your system and is non-refundable once that work has begun. If we have not started, contact us and we will refund it.",
      ],
    },
    {
      heading: "What Revora provides",
      body: [
        "Build and launch of your website and growth system, platform access, hosting and system management, automations, updates, technical support, reporting and ongoing optimization as described on our pricing page.",
        "Revora provides tools and services designed to improve how your business captures and converts leads. We do not guarantee specific rankings, traffic, lead volume or revenue. Any figures shown in calculators or examples are estimates based on inputs, not promises.",
      ],
    },
    {
      heading: "Your responsibilities",
      body: [
        "Provide accurate business information and keep your login credentials secure.",
        "Own or have rights to the content, images and trademarks you upload, and ensure your services, claims, pricing and licensing statements are lawful and truthful.",
        "Comply with applicable law when messaging customers, including consent and unsubscribe rules for email and SMS.",
      ],
    },
    {
      heading: "Acceptable use",
      body: [
        "No unlawful, deceptive, adult, hateful or harmful content; no spam or purchased contact lists; no attempts to breach, overload, reverse engineer or resell the platform; no use of AI features to generate misleading claims, fake reviews or impersonation.",
        "We may suspend a workspace that violates these rules, with notice where practical.",
      ],
    },
    {
      heading: "Data ownership",
      body: [
        "Your business content and your customer records are yours. You can export them, and they remain available while your account is active.",
        "Revora retains ownership of the platform, its software, templates, systems and improvements. You receive a non-exclusive right to use them while your account is in good standing.",
      ],
    },
    {
      heading: "Third-party services",
      body: [
        "The platform integrates services such as payment processing, email delivery, domains and AI providers. Their availability and terms are outside our control, and outages at a provider may affect related features.",
      ],
    },
    {
      heading: "Liability",
      body: [
        "The platform is provided as-is to the extent permitted by law. Revora is not liable for indirect, incidental or consequential damages, or lost profits. Our total liability for any claim is limited to the fees you paid in the 12 months before the claim.",
      ],
    },
    {
      heading: "Changes to these terms",
      body: [
        "We may update these terms; material changes will be emailed to account holders. Continued use after the effective date means acceptance.",
      ],
    },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="border-b border-border">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <p className="eyebrow">Legal</p>
            <h1 className="mt-2 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight font-semibold">
              Terms of Service
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
