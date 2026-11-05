/**
 * analytics.summary: read-only traffic, conversions and trend for this
 * workspace. Uses the SAME events query and the SAME summarizeTraffic() as the
 * traffic report (traffic.functions.ts getTrafficReport), so the numbers match
 * what the owner sees; it never writes the notifications/checked-at rows that
 * report does.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { fetchAllRows } from "@/lib/paginate";
import { summarizeTraffic, type TrafficEvent } from "@/lib/traffic";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";
import { db, MAX_BYTES, type Db } from "./shared";

export async function readTrafficEvents(client: Db, organizationId: string, days: number) {
  const since = new Date(Date.now() - days * 2 * 86_400_000).toISOString();
  const events = await fetchAllRows<TrafficEvent>(
    (from, to) =>
      client
        .from("analytics_events")
        .select("event_type, path, source, device, session_id, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to) as never,
  );
  return events.rows;
}

export const analyticsSummary = () =>
  defineToolV2({
    name: "analytics.summary",
    description:
      "Website traffic for the last N days (default 30): views, visitors, conversions, conversion rate, change vs the previous period, top sources/pages/devices, daily trend, and leads received.",
    risk: "read",
    scope: "owner",
    schema: z.strictObject({ days: z.number().int().min(1).max(90).optional() }),
    run: async (input, context) => {
      const days = input.days ?? 30;
      const client = db(context);
      const [events, leads] = await Promise.all([
        readTrafficEvents(client, context.organizationId, days),
        client
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .neq("source", TEST_LEAD_SOURCE)
          .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString()),
      ]);
      const summary = summarizeTraffic(events, days);
      const out = {
        ...summary,
        leadsInWindow: leads.count ?? 0,
        daily: summary.daily,
        dailyTruncated: false,
      };
      // A 90-day daily series can exceed the size cap: keep the newest days.
      while (out.daily.length > 7 && JSON.stringify(out).length > MAX_BYTES) {
        out.daily = out.daily.slice(Math.ceil(out.daily.length / 4));
        out.dailyTruncated = true;
      }
      return out;
    },
  });
