import { Link } from "@tanstack/react-router";
import {
  Hammer,
  Link2,
  Rocket,
  TrendingUp,
  Lock,
  ShieldCheck,
  Server,
  FileCheck,
} from "lucide-react";
import { Panel, Pill } from "@/components/app/Bits";
import { MAIL_SUBJECTS, REVORA, revoraMailto } from "@/lib/brand";

const DELIVERY = [
  {
    icon: Hammer,
    step: "We build it",
    body: "Your site, services, pricing rules, quote logic and booking rules — configured around your trade.",
  },
  {
    icon: Link2,
    step: "We connect it",
    body: "Domain, lead capture, CRM, follow-up, reviews, SEO and analytics wired into one system.",
  },
  {
    icon: Rocket,
    step: "We launch it",
    body: "You review and approve, then we publish. You get a live address you can put on your truck.",
  },
  {
    icon: TrendingUp,
    step: "We optimize it",
    body: "Ongoing updates, automation tuning and reporting so the system keeps improving.",
  },
] as const;

const RELIABILITY = [
  {
    icon: Lock,
    title: "Your data is isolated",
    body: "Every workspace is tenant-scoped with database-level row security, so your customers are only ever visible to you.",
  },
  {
    icon: ShieldCheck,
    title: "Payments handled by Stripe",
    body: "Card details go straight to Stripe. Revora never stores or sees a card number.",
  },
  {
    icon: Server,
    title: "Managed hosting and SSL",
    body: "Hosting, HTTPS certificates and system updates are included and handled for you.",
  },
  {
    icon: FileCheck,
    title: "You approve before launch",
    body: "Nothing goes public until you review the build. Version history lets us roll back any change.",
  },
] as const;

/**
 * Premium trust block. Deliberately contains no testimonials, logos, client
 * names or performance statistics — only claims that are true of the product.
 * The "customer stories" slot below is the structured place to add real,
 * verified stories later.
 */
export function TrustSection() {
  return (
    <div>
      <p className="eyebrow">Trust</p>
      <h2 className="mt-2 max-w-3xl font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
        Built for businesses that depend on customers.
      </h2>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Revora is a done-for-you system, not software you have to figure out. Here is exactly what
        we do and how your business is protected.
      </p>

      <div className="mt-9 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DELIVERY.map(({ icon: Icon, step, body }, i) => (
          <Panel key={step} className="card-lift flex h-full flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-md border border-primary/35 bg-primary/10">
                <Icon className="size-4 text-primary" aria-hidden="true" />
              </span>
              <span className="tnum font-display text-[13px] font-semibold tracking-[0.16em] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-4 font-display text-[15px] font-semibold">{step}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-2">
        {RELIABILITY.map(({ icon: Icon, title, body }) => (
          <Panel key={title} className="card-lift flex h-full gap-3.5 p-5">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-display text-[14.5px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </Panel>
        ))}
      </div>

      {/* Structured slot for real, verified customer stories. */}
      <Panel className="mt-4 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">Customer stories</p>
            <Pill tone="neutral">Coming soon</Pill>
          </div>
          <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            We publish results and testimonials only once they are real and verified with the
            business owner. No stock logos, no invented numbers. Want to be one of the first? Talk
            to {REVORA.founder.name} directly.
          </p>
        </div>
        <Link
          to="/contact"
          className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-medium text-primary hover:underline"
        >
          Talk to us
        </Link>
      </Panel>

      <p className="mt-4 text-[13px] text-muted-foreground">
        Questions before you start?{" "}
        <a className="text-primary underline underline-offset-2" href={revoraMailto(MAIL_SUBJECTS.inquiry)}>
          {REVORA.email}
        </a>{" "}
        · {REVORA.phoneDisplay}
      </p>
    </div>
  );
}
