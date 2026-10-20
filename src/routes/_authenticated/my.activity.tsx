/**
 * Client portal — leads and bookings.
 *
 * Everything the client's website captured, in plain language: who enquired,
 * what they wanted, and every booking with its date, time and contact details.
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useAppointments, useLeads } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { dateLong, relative } from "@/lib/format";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";

export const Route = createFileRoute("/_authenticated/my/activity")({
  head: () => ({
    meta: [
      { title: "My leads and bookings — Revora client portal" },
      {
        name: "description",
        content:
          "Every enquiry and booking your website captured, with contact details, dates and times.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My leads and bookings — Revora client portal" },
      { property: "og:description", content: "Review website enquiries and appointments in your secure client portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyActivity,
});

function MyActivity() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const { data: leads, isPending: leadsPending, isError: leadsError, refetch: retryLeads, isFetching: leadsFetching } = useLeads(orgId);
  const { data: appointments, isPending: bookingsPending, isError: bookingsError, refetch: retryBookings, isFetching: bookingsFetching } = useAppointments(orgId);
  const [tab, setTab] = React.useState<"leads" | "bookings">("leads");

  const rows = leads ?? [];
  const bookings = appointments ?? [];

  return (
    <div className="product-page">
      <div className="flex gap-2">
        <Button
          variant={tab === "leads" ? "default" : "outline"}
          size="sm"
          aria-pressed={tab === "leads"}
          onClick={() => setTab("leads")}
        >
          Leads ({rows.length})
        </Button>
        <Button
          variant={tab === "bookings" ? "default" : "outline"}
          size="sm"
          aria-pressed={tab === "bookings"}
          onClick={() => setTab("bookings")}
        >
          Bookings ({bookings.length})
        </Button>
      </div>

      {tab === "leads" ? (
        <Panel>
          <SectionHeading
            eyebrow="Leads"
            title="Enquiries from your website"
          />
          <div className="mt-4">
            {leadsError ? (
              <QueryErrorNotice title="Your enquiries couldn't be loaded." retry={retryLeads} retrying={leadsFetching} />
            ) : leadsPending ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">No enquiries yet.</p>
                <Button asChild variant="outline"><Link to="/my/site">Review my website</Link></Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((lead) => (
                  <li key={lead.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13.5px] font-medium">{lead.name}</p>
                      <div className="flex items-center gap-2">
                        <Pill tone={lead.status === "new" ? "signal" : "neutral"}>
                          {lead.status}
                        </Pill>
                        <span className="text-[11.5px] text-muted-foreground">
                          {relative(new Date(lead.created_at))}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 break-words text-[12.5px] text-muted-foreground">
                      {[lead.email, lead.phone, lead.city, lead.service_interest]
                        .filter(Boolean)
                        .join(" · ") || "No contact details provided"}
                    </p>
                    {lead.message ? (
                      <p className="mt-1 text-[12.5px] leading-relaxed">{lead.message}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      ) : (
        <Panel>
          <SectionHeading
            eyebrow="Bookings"
            title="Appointments booked online"
            description="Taken straight from the Book section of your website."
          />
          <div className="mt-4">
            {bookingsError ? (
              <QueryErrorNotice title="Your bookings couldn't be loaded." retry={retryBookings} retrying={bookingsFetching} />
            ) : bookingsPending ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : bookings.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">No bookings yet.</p>
                <Button asChild variant="outline"><Link to="/app/calendar">Review booking settings</Link></Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {bookings.map((appointment) => (
                  <li key={appointment.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13.5px] font-medium">{appointment.name}</p>
                      <Pill tone={appointment.status === "cancelled" ? "danger" : "signal"}>
                        {appointment.status}
                      </Pill>
                    </div>
                    <p className="mt-1 break-words text-[12.5px] text-muted-foreground">
                      {dateLong(appointment.starts_at)}
                      {[appointment.phone, appointment.email].filter(Boolean).length
                        ? ` · ${[appointment.phone, appointment.email].filter(Boolean).join(" · ")}`
                        : ""}
                    </p>
                    {appointment.notes ? (
                      <p className="mt-1 text-[12.5px] leading-relaxed">{appointment.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
