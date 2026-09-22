/**
 * Client portal — leads and bookings.
 *
 * Everything the client's website captured, in plain language: who enquired,
 * what they wanted, and every booking with its date, time and contact details.
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useAppointments, useLeads } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { dateLong, relative } from "@/lib/format";

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
    ],
  }),
  component: MyActivity,
});

function MyActivity() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const { data: leads, isPending: leadsPending } = useLeads(orgId);
  const { data: appointments, isPending: bookingsPending } = useAppointments(orgId);
  const [tab, setTab] = React.useState<"leads" | "bookings">("leads");

  const rows = leads ?? [];
  const bookings = appointments ?? [];

  return (
    <div className="product-page">
      <div className="flex gap-2">
        <Button
          variant={tab === "leads" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("leads")}
        >
          Leads ({rows.length})
        </Button>
        <Button
          variant={tab === "bookings" ? "default" : "outline"}
          size="sm"
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
            description="You also get an email the moment each one arrives."
          />
          <div className="mt-4">
            {leadsPending ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No enquiries yet. They appear here automatically.
              </p>
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
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
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
            {bookingsPending ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : bookings.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No bookings yet. Each one lands here and in your inbox.
              </p>
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
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
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
