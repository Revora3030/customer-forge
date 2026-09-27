import { Link } from "@tanstack/react-router";
import { LifeBuoy, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/Bits";
import { MAIL_SUBJECTS, REVORA, revoraMailto, revoraTel } from "@/lib/brand";

/** Ready-to-grow sales block used across marketing pages. */
export function SalesCTA({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <p className="eyebrow">Ready to grow?</p>
      <h2 className="mx-auto mt-2 max-w-2xl font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold">
        See how Revora can turn your online presence into a complete customer acquisition system.
      </h2>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild variant="signal" size="lg">
          <Link to="/demo">Request a demo</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href={revoraTel}>
            <Phone className="size-4" aria-hidden="true" /> Call {REVORA.phoneDisplay}
          </a>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <a href={revoraMailto(MAIL_SUBJECTS.inquiry)}>
            <Mail className="size-4" aria-hidden="true" /> Email Revora
          </a>
        </Button>
      </div>
    </div>
  );
}

/** Support contact card. */
export function SupportCard() {
  return (
    <Panel className="p-6">
      <LifeBuoy className="size-5 text-primary" aria-hidden="true" />
      <h3 className="mt-3.5 font-display text-[17px] font-semibold">Need help?</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        The Revora team is here to help.
      </p>
      <ul className="mt-4 space-y-1.5 text-[13px]">
        <li>
          <a className="text-primary underline underline-offset-2" href={revoraMailto(MAIL_SUBJECTS.support)}>
            {REVORA.email}
          </a>
        </li>
        <li>
          <a className="text-primary underline underline-offset-2" href={revoraTel}>
            {REVORA.phoneDisplay}
          </a>
        </li>
      </ul>
      <Button asChild variant="outline" className="mt-5 w-full">
        <a href={revoraMailto(MAIL_SUBJECTS.support)}>Contact support</a>
      </Button>
    </Panel>
  );
}

/** Founder story — Revora stays the primary brand. */
export function FounderNote() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow text-center">From the founder</p>
      <h2 className="mt-2 text-center font-display text-[clamp(1.35rem,2.8vw,2rem)] leading-tight font-semibold">
        I built Revora because good local businesses keep losing to worse ones with better systems.
      </h2>
      <div className="mt-7 space-y-4 text-[14px] leading-relaxed text-muted-foreground">
        <p>
          The pattern was always the same. A skilled owner — great work, loyal customers, real
          reputation — was losing jobs to a competitor who wasn't better, just{" "}
          <span className="text-foreground">faster to respond and easier to book</span>. Leads came
          in while they were on a roof, under a sink, or in a truck. By the time they called back,
          the job was gone.
        </p>
        <p>
          Software wasn't the answer either. Owners were sold a website from one company, a CRM from
          another, a booking tool, an email tool, an SEO retainer — then left to wire it together in
          their spare time. Most never did. So the tools sat unused while the leaks stayed open.
        </p>
        <p>
          Revora is the opposite approach:{" "}
          <span className="text-foreground">one system, built and managed for you</span>. We set up
          the site, the quoting, the booking, the CRM, the follow-up, the reviews, the local SEO and
          the reporting — and the AI keeps improving it while you do the work you're actually good
          at. You should never have to become a marketer to grow.
        </p>
        <p>
          That's also why the pricing is flat and the trial is free. You get{" "}
          <span className="text-foreground">full access first</span>, see the system running on your
          own business, and only then decide. No contracts, no retainers, no guesswork.
        </p>
      </div>
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="inline-flex items-center gap-3 rounded-full border border-primary/30 bg-card px-4 py-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary/15 font-display text-[13px] font-semibold text-primary">
            A
          </span>
          <span className="text-left">
            <span className="block text-[13px] font-medium">{REVORA.founder.name}</span>
            <span className="block text-[11px] text-muted-foreground">{REVORA.founder.role}</span>
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={revoraMailto(MAIL_SUBJECTS.inquiry)}>
              <Mail className="size-4" aria-hidden="true" /> Email{" "}
              {REVORA.founder.name.split(" ")[0]}
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={revoraTel}>
              <Phone className="size-4" aria-hidden="true" /> {REVORA.phoneDisplay}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Sticky mobile action bar for Revora marketing pages only (never client sites). */
export function RevoraMobileBar() {
  return (
    <>
      {/* Keeps the bar from covering whatever sits at the bottom of the page,
          such as the send button on the contact form. */}
      <div className="h-24 md:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={revoraTel}>Call</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={revoraMailto(MAIL_SUBJECTS.inquiry)}>Email</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/pricing">Quote</Link>
          </Button>
          <Button asChild variant="signal" size="sm">
            <Link to="/demo">Book</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
