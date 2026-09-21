import { loadTenantPage, tenantPageHead, TenantOrMarketing } from "@/lib/tenant-page";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { submitContactRequest } from "@/lib/contact.functions";

import { useState } from "react";
import { toast } from "@/lib/ui/notify";
import { Mail, Phone } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { RevoraMobileBar, SupportCard } from "@/components/marketing/SalesCTA";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAIL_SUBJECTS, REVORA, revoraMailto, revoraTel } from "@/lib/brand";
import { canonicalLink, ogUrl } from "@/lib/seo";

const INTERESTS = [
  "Website",
  "Lead Generation",
  "CRM",
  "Booking",
  "Quotes",
  "AI",
  "Automations",
  "Analytics",
  "Complete Revora System",
  "Other",
] as const;

export const Route = createFileRoute("/contact")({
  // On a client's own web address this path is THEIR page, not Revora's.
  loader: () => loadTenantPage("contact"),
  head: ({ loaderData }) =>
    tenantPageHead(loaderData ?? null) ?? {
      meta: [
        { title: "Contact Revora — Build your customer growth system" },
        {
          name: "description",
          content:
            "Questions about Revora, want to see the platform in action, or ready to build a customer acquisition system? Email Revorabusiness0@gmail.com or call (919) 622-6620.",
        },
        { property: "og:title", content: "Contact Revora" },
        {
          property: "og:description",
          content: "Get in touch with the Revora team about your customer acquisition system.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ogUrl("/contact"),
      ],
      links: [canonicalLink("/contact")],
    },
  component: ContactRoute,
});

/** Revora's page on Revora's address; the client's page on a client address. */
function ContactRoute() {
  const tenant = Route.useLoaderData();
  return (
    <TenantOrMarketing tenant={tenant}>
      <Contact />
    </TenantOrMarketing>
  );
}

function Contact() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [interest, setInterest] = useState<string>("Complete Revora System");
  const send = useServerFn(submitContactRequest);

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <SiteHeader />
      <main className="hero-aura mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-12">
          <div>
            <p className="eyebrow">Contact Revora</p>
            <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.8rem)] leading-tight font-semibold">
              Let's build your <span className="gold-text">customer growth system</span>.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Have a question about Revora, want to see the platform in action, or ready to build a
              customer acquisition system for your business? Get in touch with the Revora team.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              <li className="panel card-lift flex items-center gap-3.5 p-4">
                <Mail className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="eyebrow">Email</p>
                  <a
                    href={revoraMailto(MAIL_SUBJECTS.inquiry)}
                    className="block truncate text-[13px] font-medium hover:text-primary"
                  >
                    {REVORA.email}
                  </a>
                </div>
              </li>
              <li className="panel card-lift flex items-center gap-3.5 p-4">
                <Phone className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="eyebrow">Phone</p>
                  <a href={revoraTel} className="block text-[13px] font-medium hover:text-primary">
                    {REVORA.phoneDisplay}
                  </a>
                </div>
              </li>
            </ul>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild variant="signal">
                <a href={revoraMailto(MAIL_SUBJECTS.inquiry)}>Email Revora</a>
              </Button>
              <Button asChild variant="outline">
                <a href={revoraTel}>Call Revora</a>
              </Button>
              <Button asChild variant="outline">
                <Link to="/demo">Request a demo</Link>
              </Button>
            </div>

            <div className="mt-8">
              <SupportCard />
            </div>
          </div>

          <div className="panel p-6 lg:sticky lg:top-24">
            <div className="mb-5 border-b border-border pb-4">
              <h2 className="font-display text-[17px] font-semibold">Send a message</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Tell us about your business and what you want the system to do. Replies come from{" "}
                {REVORA.email}.
              </p>
            </div>

            {sent ? (
              <div className="py-10 text-center">
                <h2 className="font-display text-[17px] font-semibold">Message received</h2>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Thanks for contacting Revora. We've received your request and will be in touch.
                </p>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (sending) return;
                  const form = e.currentTarget;
                  const values = new FormData(form);
                  setSending(true);
                  try {
                    await send({
                      data: {
                        name: String(values.get("name") ?? ""),
                        email: String(values.get("email") ?? ""),
                        business: String(values.get("business") ?? ""),
                        phone: String(values.get("phone") ?? ""),
                        businessType: String(values.get("businessType") ?? ""),
                        interest,
                        message: String(values.get("message") ?? ""),
                        landingPath:
                          typeof window === "undefined" ? null : window.location.pathname,
                      },
                    });
                    setSent(true);
                    toast.success("Message sent — the Revora team will be in touch.");
                  } catch (err) {
                    toast.error(
                      err instanceof Error && err.message
                        ? err.message
                        : "We could not send that. Please email us directly.",
                    );
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-name">Name</Label>
                    <Input id="c-name" name="name" required autoComplete="name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-business">Business name</Label>
                    <Input id="c-business" name="business" autoComplete="organization" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-email">Email</Label>
                    <Input id="c-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-phone">Phone</Label>
                    <Input id="c-phone" name="phone" type="tel" autoComplete="tel" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-type">Business type</Label>
                  <Input id="c-type" name="businessType" placeholder="e.g. mobile detailing" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-interest">What are you interested in?</Label>
                  <select
                    id="c-interest"
                    name="interest"
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    className="select-field h-10 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
                  >
                    {INTERESTS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-message">Message</Label>
                  <Textarea id="c-message" name="message" rows={5} required />
                </div>
                <Button type="submit" variant="signal" className="w-full" disabled={sending}>
                  {sending ? "Sending…" : "Send message"}
                </Button>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Prefer to talk it through? Call {REVORA.phoneDisplay} — no automated queue.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
      <RevoraMobileBar />
    </div>
  );
}
