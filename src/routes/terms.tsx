import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { REVORA } from "@/lib/brand";
import { LEGAL, operatorStatement } from "@/lib/legal";
import { GROWTH_SYSTEM, REFUND_POLICY, usd } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, jsonLdScript, ogUrl, OG_IMAGE_META } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Revora Growth Systems" },
      {
        name: "description",
        content:
          "Revora terms of service: free trial, $350 setup, $100/month, first month free, cancellation, data ownership, acceptable use and support.",
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
      ...OG_IMAGE_META,
    ],
    links: [canonicalLink("/terms")],
    scripts: [
      jsonLdScript(
        breadcrumbSchema([
          { name: "Revora", path: "/" },
          { name: "Terms of service", path: "/terms" },
        ]),
      ),
    ],
  }),
  component: TermsPage,
});

/*
 * REVIEW WITH A LAWYER BEFORE RELYING ON THIS.
 * Plain terms that match what the code and checkout do today. No governing-law
 * or arbitration clause is included: that is a choice for the owner and a lawyer.
 */
function TermsPage() {
  const SECTIONS: { heading: string; body: string[] }[] = [
    {
      heading: "The agreement",
      body: [
        `These terms govern your use of the Revora Growth Systems platform and the services we provide. By creating an account you agree to them. Questions: ${REVORA.email}.`,
        operatorStatement(),
      ],
    },
    {
      heading: "Free access trial",
      body: [
        `New accounts receive ${GROWTH_SYSTEM.fullAccessWindow} of full platform access at no cost and with no card required. The trial begins when your workspace is created and ends automatically. When it ends, continued access requires the ${usd(GROWTH_SYSTEM.setupPrice)} setup payment.`,
      ],
    },
    {
      heading: "Fees and billing",
      body: [
        `${usd(GROWTH_SYSTEM.setupPrice)} one-time setup covers implementation, customization and launch of your system. It is charged when you choose to proceed after (or during) the trial.`,
        `The platform fee is ${usd(GROWTH_SYSTEM.monthlyPrice)}/month. Your first month is free: the first monthly charge occurs 30 days after setup (month two) and recurs monthly until canceled.`,
        `Automatic renewal: the monthly subscription renews automatically every month and charges the card saved at checkout ${usd(GROWTH_SYSTEM.monthlyPrice)} until you cancel. Checkout shows these amounts and dates before you pay.`,
        "Payments are processed by Stripe. Taxes, if applicable, are added at checkout. Failed payments may suspend access until resolved.",
      ],
    },
    {
      heading: "Cancellation and refunds",
      body: [
        REFUND_POLICY,
        `You can cancel the monthly subscription at any time from Billing → Manage subscription in the app, or by emailing ${REVORA.email}. Access continues to the end of the paid period and no further charges are made.`,
        "After the paid period ends, your published site stays online for 14 more days and then goes offline. Your workspace data is kept so you can reactivate, unless you ask us to delete it.",
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
        "Some site images and copy are generated by AI models, and some photos and videos come from stock libraries (Pexels, Unsplash) under their own licences. We do not promise that AI-generated material is protected by copyright or free of third-party rights; replace anything you are unsure about with your own content.",
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
            <h1 className="mt-2 font-editorial text-balance text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
              Terms of Service
            </h1>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Last updated {LEGAL.termsLastUpdated}
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
