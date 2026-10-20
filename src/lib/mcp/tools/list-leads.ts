import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type LeadRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string;
  service_interest: string | null;
  city: string | null;
  created_at: string;
  next_follow_up_at: string | null;
};

const toLeadJson = (lead: LeadRow) => ({
  id: lead.id,
  organizationId: lead.organization_id,
  name: lead.name,
  email: lead.email,
  phone: lead.phone,
  status: lead.status,
  source: lead.source,
  serviceInterest: lead.service_interest,
  city: lead.city,
  createdAt: lead.created_at,
  nextFollowUpAt: lead.next_follow_up_at,
});

export default defineTool({
  name: "list_leads",
  title: "List leads",
  description:
    "List recent leads across the signed-in user's workspaces, newest first. Optionally filter by lead status.",
  inputSchema: {
    status: z
      .string()
      .min(1)
      .optional()
      .describe("Optional lead status filter (e.g. \"new\", \"contacted\", \"won\", \"lost\")."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum leads to return (default 25, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("leads")
      .select(
        "id,organization_id,name,email,phone,status,source,service_interest,city,created_at,next_follow_up_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const leads = ((data ?? []) as LeadRow[]).map(toLeadJson);
    const summary = leads.length
      ? leads
          .map((l) => `${l.name} — ${l.status} — ${l.serviceInterest ?? "general"} — ${l.email ?? l.phone ?? "no contact"}`)
          .join("\n")
      : "No leads found.";
    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { leads },
    };
  },
});
