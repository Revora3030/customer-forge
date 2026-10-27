/**
 * Speed to lead: how quickly new enquiries are contacted. Reads the owner's own
 * leads and logged call/email/text activity, never an estimate, and shows a
 * read failure as a failure instead of an empty record.
 */
import { useMemo } from "react";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { useLeadFirstContacts } from "@/lib/queries";
import {
  SPEED_GOAL_MINUTES,
  SPEED_WINDOW_DAYS,
  computeSpeedToLead,
  formatWait,
  type SpeedLead,
} from "@/lib/speed-to-lead";

export function SpeedToLeadView({
  leads,
  contacts,
  truncated = false,
  now = new Date(),
}: {
  leads: readonly SpeedLead[];
  contacts: Parameters<typeof computeSpeedToLead>[1];
  truncated?: boolean;
  now?: Date;
}) {
  const speed = computeSpeedToLead(leads, contacts, now);

  if (speed.leadCount === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No enquiries in the last {SPEED_WINDOW_DAYS} days yet. Once leads arrive, this shows how fast each one is answered.
      </p>
    );
  }

  const stats: { label: string; value: string }[] = [
    { label: "Median first reply", value: speed.medianMinutes === null ? "—" : formatWait(speed.medianMinutes) },
    { label: `Answered within ${SPEED_GOAL_MINUTES} min`, value: speed.withinGoalPct === null ? "—" : `${speed.withinGoalPct}%` },
    { label: "Not contacted", value: String(speed.missed) },
  ];

  return (
    <div className="mt-3 space-y-3">
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {speed.waiting.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {speed.waiting.length === 1 ? "1 lead is" : `${speed.waiting.length} leads are`} still waiting — the longest for{" "}
          {formatWait(speed.waiting[0]!.minutes)}.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">Every enquiry in this period has a logged reply.</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Counts calls, emails and texts logged on the lead in the last {SPEED_WINDOW_DAYS} days.
        {truncated ? " Showing the most recent activity only." : ""}
      </p>
    </div>
  );
}

export function SpeedToLeadCard({
  organizationId,
  leads,
  leadsFailed,
  retryLeads,
}: {
  organizationId: string | undefined;
  leads: readonly SpeedLead[];
  leadsFailed: boolean;
  retryLeads: () => unknown;
}) {
  const sinceIso = useMemo(() => new Date(Date.now() - SPEED_WINDOW_DAYS * 86_400_000).toISOString(), []);
  const contacts = useLeadFirstContacts(organizationId, sinceIso);

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="speed-to-lead-title">
      <p className="eyebrow">Speed to lead</p>
      <h2 id="speed-to-lead-title" className="mt-1 text-base font-semibold">
        How fast new enquiries get a reply
      </h2>
      {leadsFailed || contacts.isError ? (
        <div className="mt-3">
          <QueryErrorNotice
            title="Couldn't load your reply times."
            retry={() => {
              if (leadsFailed) void retryLeads();
              if (contacts.isError) void contacts.refetch();
            }}
            retrying={contacts.isFetching}
          />
        </div>
      ) : contacts.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <SpeedToLeadView leads={leads} contacts={contacts.data.rows} truncated={contacts.data.truncated} />
      )}
    </section>
  );
}
