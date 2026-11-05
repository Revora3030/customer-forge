/**
 * leads.list / leads.get: read-only, same org filter and columns the Leads
 * page uses (queries.useLeads). List is PII-light (no full email/phone);
 * get returns contact details for one lead the owner asked for.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";
import { bounded, db, readFailed } from "./shared";

const LIST_COLS =
  "id, name, status, source, campaign, city, service_interest, estimated_value, next_follow_up_at, last_contacted_at, first_response_at, created_at, email, phone";

function lightLead(row: {
  id: string;
  name: string;
  status: string;
  source: string;
  campaign: string | null;
  city: string | null;
  service_interest: string | null;
  estimated_value: number;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  first_response_at: string | null;
  created_at: string;
  email: string | null;
  phone: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    source: row.source,
    campaign: row.campaign,
    city: row.city,
    service_interest: row.service_interest,
    estimated_value: row.estimated_value,
    next_follow_up_at: row.next_follow_up_at,
    last_contacted_at: row.last_contacted_at,
    first_response_at: row.first_response_at,
    created_at: row.created_at,
    has_email: Boolean(row.email),
    has_phone: Boolean(row.phone),
  };
}

export const leadsList = defineToolV2({
  name: "leads.list",
  description:
    "List this workspace's leads (newest first). PII-light: no full emails or phones. Optional status filter.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    status: z
      .enum(["new", "contacted", "qualified", "quoted", "booked", "completed", "lost"])
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  run: async (input, context) => {
    const limit = input.limit ?? 50;
    let query = db(context)
      .from("leads")
      .select(LIST_COLS)
      .eq("organization_id", context.organizationId)
      .neq("source", TEST_LEAD_SOURCE)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) readFailed(error);
    const leads = ((data ?? []) as Array<Parameters<typeof lightLead>[0]>).map(lightLead);
    return bounded({ leads }, "leads");
  },
});

export const leadsGet = defineToolV2({
  name: "leads.get",
  description:
    "Get one lead by id for this workspace, including email and phone when stored.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({ leadId: z.string().uuid() }),
  run: async (input, context) => {
    const { data, error } = await db(context)
      .from("leads")
      .select(
        "id, name, email, phone, status, source, campaign, city, message, service_interest, estimated_value, next_follow_up_at, last_contacted_at, first_response_at, notes, created_at",
      )
      .eq("organization_id", context.organizationId)
      .eq("id", input.leadId)
      .maybeSingle();
    if (error) readFailed(error);
    if (!data) return { lead: null };
    const row = data as {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: string;
      source: string;
      campaign: string | null;
      city: string | null;
      message: string | null;
      service_interest: string | null;
      estimated_value: number;
      next_follow_up_at: string | null;
      last_contacted_at: string | null;
      first_response_at: string | null;
      notes: string | null;
      created_at: string;
    };
    const message =
      row.message && row.message.length > 400 ? `${row.message.slice(0, 400)}…` : row.message;
    const notes = row.notes && row.notes.length > 400 ? `${row.notes.slice(0, 400)}…` : row.notes;
    return {
      lead: {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        source: row.source,
        campaign: row.campaign,
        city: row.city,
        message,
        service_interest: row.service_interest,
        estimated_value: row.estimated_value,
        next_follow_up_at: row.next_follow_up_at,
        last_contacted_at: row.last_contacted_at,
        first_response_at: row.first_response_at,
        notes,
        created_at: row.created_at,
      },
    };
  },
});
