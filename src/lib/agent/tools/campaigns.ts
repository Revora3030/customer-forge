/**
 * campaigns.list / campaigns.results: read-only. Same queries and the same
 * per-campaign attribution as the Campaigns page (growth-hooks useCampaigns /
 * useCampaignLeads): views = campaign page_view events, conversions = other
 * campaign events, leads = non-test leads tagged with the campaign code.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";
import { bounded, db, readFailed, type Db } from "./shared";

type CampaignRow = {
  id: string;
  name: string;
  source: string | null;
  medium: string | null;
  code: string;
  target_path: string | null;
  scans: number;
  created_at: string;
};

export async function readCampaignRows(client: Db, organizationId: string) {
  const [{ data: campaigns, error }, { data: events }] = await Promise.all([
    client
      .from("campaigns")
      .select("id, name, source, medium, code, target_path, scans, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    client
      .from("analytics_events")
      .select("campaign, event_type")
      .eq("organization_id", organizationId)
      .not("campaign", "is", null),
  ]);
  if (error) readFailed(error);
  const perf = new Map<string, { views: number; conversions: number }>();
  for (const event of (events ?? []) as Array<{ campaign: string | null; event_type: string }>) {
    const key = String(event.campaign);
    const row = perf.get(key) ?? { views: 0, conversions: 0 };
    if (event.event_type === "page_view") row.views += 1;
    else row.conversions += 1;
    perf.set(key, row);
  }
  return ((campaigns ?? []) as CampaignRow[]).map((c) => ({
    ...c,
    views: perf.get(c.code)?.views ?? 0,
    conversions: perf.get(c.code)?.conversions ?? 0,
  }));
}

export const campaignsList = defineToolV2({
  name: "campaigns.list",
  description:
    "List this workspace's tracking campaigns (name, source, medium, code, landing path, created date).",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({}),
  run: async (_input, context) => {
    const rows = await readCampaignRows(db(context), context.organizationId);
    return bounded(
      {
        campaigns: rows.map(({ id, name, source, medium, code, target_path, created_at }) => ({
          id,
          name,
          source,
          medium,
          code,
          target_path,
          created_at,
        })),
      },
      "campaigns",
    );
  },
});

export const campaignsResults = defineToolV2({
  name: "campaigns.results",
  description:
    "Results per campaign: QR scans, page views, conversions and leads (with won/estimated value). Optionally one campaign by id.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({ campaignId: z.string().uuid().optional() }),
  run: async (input, context) => {
    const client = db(context);
    const rows = await readCampaignRows(client, context.organizationId);
    const { data: leads, error } = await client
      .from("leads")
      .select("id, campaign, source, status, estimated_value")
      .eq("organization_id", context.organizationId)
      .neq("source", TEST_LEAD_SOURCE);
    if (error) readFailed(error);
    const byCode = new Map<string, { leads: number; won: number; estimatedValue: number }>();
    for (const lead of (leads ?? []) as Array<{
      campaign: string | null;
      status: string;
      estimated_value: number | null;
    }>) {
      if (!lead.campaign) continue;
      const entry = byCode.get(lead.campaign) ?? { leads: 0, won: 0, estimatedValue: 0 };
      entry.leads += 1;
      if (lead.status === "won") entry.won += 1;
      entry.estimatedValue += Number(lead.estimated_value) || 0;
      byCode.set(lead.campaign, entry);
    }
    const results = rows
      .filter((row) => !input.campaignId || row.id === input.campaignId)
      .map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        scans: row.scans,
        views: row.views,
        conversions: row.conversions,
        ...(byCode.get(row.code) ?? { leads: 0, won: 0, estimatedValue: 0 }),
      }));
    return bounded({ results }, "results");
  },
});
