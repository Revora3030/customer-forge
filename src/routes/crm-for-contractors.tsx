import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  MessageSquare,
  PhoneCall,
  Star,
  Users,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { CRM_SOLUTIONS } from "@/lib/crm-solutions";
import { GROWTH_SYSTEM } from "@/lib/offer";

const TITLE = "CRM for Contractors — Leads, Quotes & Follow-Up | Revora";
const DESCRIPTION =
  "A contractor CRM built into your website: capture leads, send quotes, chase follow-ups, book jobs and collect reviews in one system. 1 day free full access.";
const URL = "https://revoragrowthsystems.com/crm-for-contractors";

export const Route = createFileRoute("/crm-for-contractors")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "product" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Revora Growth System — CRM for Contractors",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description: DESCRIPTION,
          url: URL,
          offers: {
            "@type": "Offer",
            priceCurrency: "USD",
            price: String(GROWTH_SYSTEM.setupPrice),
            description: `One-time setup, then $${GROWTH_SYSTEM.monthlyPrice}/month after the first month free.`,
          },
        }),
      },
    ],
  }),
  component: ContractorCrmPage,
});

const STEPS = [
  {
    icon: Users,
    title: "Every lead lands in one place",
    body: "Website forms, quote requests and click-to-call all create a contact record with the job details attached — nothing sits in a text thread.",
  },
  {
    icon: FileText,
    title: "Quotes go out the same day",
    body: "Build a quote from your own service list and pricing, send it as a link, and see when the customer opens it.",
  },
  {
    icon: MessageSquare,
    title: "Follow-up runs itself",
    body: "Automated email and text follow-ups keep unanswered quotes moving instead of going cold after one missed call.",
  },
  {
    icon: CalendarCheck,
    title: "Jobs get on the calendar",
    body: "Customers pick a slot from your availability; the booking writes straight into your calendar and CRM pipeline.",
  },
  {
    icon: Star,
    title: "Reviews get requested automatically",
    body: "Once a job is marked complete, Revora asks for a review and publishes the approved ones on your site.",
  },
  {
    icon: PhoneCall,
    title: "Nothing lives in a spreadsheet",
    body: "Pipeline stages, notes, service areas and job history stay on the contact record so any crew member can pick it up.",
  },
];

function ContractorCrmPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="hero-aura mx-auto max-w-5xl px-4 py-16">
        <p className="eyebrow">CRM for contractors</p>
        <h1 className="mt-2 max-w-3xl font-display text-[clamp(2rem,4.4vw,3rem)] leading-tight font-semibold">
          A contractor CRM that is <span className="text-primary">wired into your website</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Most contractor CRMs assume leads are already coming in. Revora builds the website that
          produces the enquiry, then runs the lead through quote, follow-up, booking and review —
          one system instead of a site, a CRM and three apps that do not talk to each other.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild variant="signal" size="lg">
            <Link to="/auth" search={{ mode: "signup", redirect: "/get-started" }}>
              Start 1 day free <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/demo/dashboard">See the live product demo</Link>
          </Button>
        </div>

        <section className="mt-16">
          <h2 className="font-display text-[22px] font-semibold">
            What the contractor pipeline looks like
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
            Visitor → Lead → Quote → Follow-up → Booking → Customer → Review → Repeat.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {STEPS.map((step) => (
              <div key={step.title} className="panel card-lift flex h-full gap-3 p-5">
                <step.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-display text-[15px] font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-[22px] font-semibold">Built for how contractors sell</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              "Quote requests with job type, property details and photos",
              "Service-area pages so you show up for the towns you actually cover",
              "Call-now paths for emergency work",
              "Deposit and package payments taken online",
              "Crew-friendly roles so office staff and owners see the same pipeline",
              "Trades covered: contracting, HVAC, plumbing, roofing, home services",
            ].map((item) => (
              <li
                key={item}
                className="rounded-md border border-border px-3.5 py-3 text-[13px] text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] text-muted-foreground">
            Working in a related trade? Read how this works for{" "}
            <Link to="/crm" className="text-primary underline-offset-4 hover:underline">
              your specific trade
            </Link>
            , browse the{" "}
            <Link to="/industries" className="text-primary underline-offset-4 hover:underline">
              full list of trades we build for
            </Link>{" "}
            or see{" "}
            <Link to="/pricing" className="text-primary underline-offset-4 hover:underline">
              pricing
            </Link>
            .
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-[19px] font-semibold">Built around your trade</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Same system, written for how each trade actually works — including where a different
            tool would serve you better.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5 text-[13px]">
            {CRM_SOLUTIONS.map((solution) => (
              <Link
                key={solution.slug}
                to="/crm/$trade"
                params={{ trade: solution.slug }}
                className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                {solution.heading}
              </Link>
            ))}
          </div>
        </section>

        <section className="panel mt-16 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[18px] font-semibold">
              Try the whole system free for 1 day
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              No card needed to start. Add your business details and your site, CRM and quoting are
              live in minutes.
            </p>
          </div>
          <Button asChild variant="signal">
            <Link to="/get-started">Get started</Link>
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
