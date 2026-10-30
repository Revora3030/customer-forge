/**
 * Turns client health results into Jarvis event-watch events. Pure, so the
 * thresholds are unit-tested without a database.
 */
import type { PlatformEvent } from "@/lib/cognition/event-rules";
import { LEAD_WINDOW_DAYS, UNANSWERED_HOURS, type HealthResult } from "@/lib/retention/health-score";

export type HealthRow = { organizationId: string; name: string; isCustomer: boolean; health: HealthResult };

export function clientHealthEvents(rows: readonly HealthRow[], now: number): PlatformEvent[] {
  const events: PlatformEvent[] = [];
  for (const row of rows) {
    if (!row.isCustomer) continue;
    const { health } = row;
    if (health.score !== null && (health.band === "critical" || health.band === "at_risk")) {
      events.push({
        id: `${row.organizationId}:${health.band}`,
        type: health.band === "critical" ? "client.health_critical" : "client.health_low",
        occurredAt: now,
        subject: row.name,
        detail: `Health ${health.score}/100. ${health.reasons.slice(0, 3).join(" ")}`,
      });
    }
    if (health.liveDays !== null && health.liveDays >= LEAD_WINDOW_DAYS && health.leadsLast14 === 0) {
      events.push({ id: `${row.organizationId}:no-leads`, type: "client.no_leads", occurredAt: now, subject: row.name, detail: `Live ${health.liveDays} days, no leads in the last ${LEAD_WINDOW_DAYS}.` });
    }
    if (health.unansweredLeads > 0) {
      events.push({
        id: `${row.organizationId}:unanswered`,
        type: "client.leads_unanswered",
        occurredAt: now,
        subject: row.name,
        detail: `${health.unansweredLeads} lead${health.unansweredLeads === 1 ? "" : "s"} still marked new ${UNANSWERED_HOURS}h+ after arriving; the owner's daily reminder already went out.`,
      });
    }
  }
  return events;
}
