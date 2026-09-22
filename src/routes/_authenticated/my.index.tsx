/**
 * Client portal home: one honest picture of this client's business — is the
 * website live, what has it captured, what is next. Reads the same workspace
 * tables the builder writes, so it never disagrees with the live site.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useAnalytics, useAppointments, useLeads, useWebsiteSettings } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { liveAddressUrl } from "@/lib/revora-address";
import { currency, dateLong, relative } from "@/lib/format";
import { usePayments } from "@/lib/payments.hooks";
import { useBillingState } from "@/lib/stripe.hooks";

export const Route = createFileRoute("/_authenticated/my/")({
  head: () => ({
    meta: [
      { title: "My portal — website, leads and bookings at a glance" },
      {
        name: "description",
        content:
          "Your Revora portal home: live website status, leads captured, bookings taken and visits this month.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalHome,
});

function PortalHome() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const { data: settings } = useWebsiteSettings(orgId);
  const { data: leads } = useLeads(orgId);
  const { data: appointments } = useAppointments(orgId);
  const { data: events } = useAnalytics(orgId, 30);
  const { data: billing } = useBillingState(orgId);
  const { data: payments } = usePayments(orgId);

  // Billing shown in the client's own words: what they're on, and the last
  // real charge that cleared. Nothing here is sample data.
  const cleared = (payments ?? []).filter((p) => p.status === "completed");
  const lastPayment = cleared[0] ?? null;
  const subscription = billing?.subscription ?? null;
  const billingLine = !billing
    ? "Loading your plan…"
    : subscription?.status === "trialing"
      ? "Free trial running — your first month is included."
      : subscription?.status === "active"
        ? "Active — your monthly plan is paid and running."
        : subscription?.status === "past_due"
          ? "Payment failed. Update your card to keep your website live."
          : billing.setupPaid
            ? "Setup paid. Start your monthly plan to stay live."
            : "No plan started yet.";

  const live = settings?.publish_state === "published";
  // Show only an address that is proven to work: a verified domain or free
  // Revora hostname, otherwise the platform path address.
  const liveAt = liveAddressUrl(settings ?? {}, org?.slug ?? null);
  const address = liveAt.url;

  const now = Date.now();
  const upcoming = (appointments ?? []).filter((a) => new Date(a.starts_at).getTime() >= now);
  const visits = (events ?? []).filter((e) => e.event_type === "page_view").length;
  const newLeads = (leads ?? []).filter((l) => l.status === "new").length;

  return (
    <div className="product-page">
      <section className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Your website</p>
            <p className="mt-1 truncate text-[15px] font-medium">
              {liveAt.label ?? "Not created yet"}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {live
                ? settings?.last_published_at
                  ? `Live · published ${relative(new Date(settings.last_published_at))}`
                  : "Live"
                : "Not live yet — finish the setup steps and publish"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={live ? "signal" : "neutral"}>{live ? "Live" : "Draft"}</Pill>
            {address ? (
              <Button asChild variant="outline" size="sm">
                <a href={address} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  View site
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Leads" value={String((leads ?? []).length)} />
        <MetricCard label="New leads" value={String(newLeads)} />
        <MetricCard label="Upcoming bookings" value={String(upcoming.length)} />
        <MetricCard label="Visits (30 days)" value={String(visits)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHeading eyebrow="Leads" title="Latest leads" />
          <div className="mt-3">
            {(leads ?? []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No leads yet. Every form on your live site lands here — and emails you instantly.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(leads ?? []).slice(0, 5).map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{lead.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {[lead.service_interest, lead.city, lead.email, lead.phone]
                          .filter(Boolean)
                          .join(" · ") || "New enquiry"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {relative(new Date(lead.created_at))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/my/activity">
                All leads & bookings
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Panel>

        <Panel>
          <SectionHeading eyebrow="Calendar" title="Next bookings" />
          <div className="mt-3">
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing booked yet. Bookings from your site's Book section appear here with date,
                time and contact details.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 5).map((appointment) => (
                  <li key={appointment.id} className="py-2.5">
                    <p className="text-[13px] font-medium">{appointment.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {dateLong(appointment.starts_at)}
                      {appointment.phone ? ` · ${appointment.phone}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeading eyebrow="Billing" title="Your plan and payments" />
        <p className="text-[13px] text-muted-foreground">{billingLine}</p>
        {lastPayment ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Last payment: {currency(Number(lastPayment.amount))} ·{" "}
            {lastPayment.description ?? "Revora Growth System"} ·{" "}
            {relative(new Date(lastPayment.completed_at ?? lastPayment.created_at))}
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-muted-foreground">
            No card payments yet. Every charge appears here the moment it clears.
          </p>
        )}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/billing">
              View plan &amp; receipts
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Panel>

      <Panel>
        <SectionHeading eyebrow="Website" title="Your website details" />
        <p className="text-[13px] text-muted-foreground">
          See your pages, what each one says and how visitors reach you.
        </p>
        <div className="mt-3">
          <Button asChild size="sm">
            <Link to="/my/site">
              Open my website
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
