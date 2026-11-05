/**
 * quotes.list / quotes.get: read-only. Same quotes + line items the Quotes
 * page loads (service-catalog.hooks useQuotes). List is PII-light; get returns
 * contact details for one quote.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { bounded, db, readFailed, type Db } from "./shared";

type QuoteRow = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  lead_id: string | null;
  appointment_id: string | null;
  status: string;
  notes: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  quote_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  sort_order: number;
};

async function linesFor(client: Db, organizationId: string, quoteIds: string[]) {
  if (quoteIds.length === 0) return new Map<string, LineRow[]>();
  const { data, error } = await client
    .from("quote_line_items")
    .select("quote_id, name, unit_price, quantity, sort_order")
    .eq("organization_id", organizationId)
    .in("quote_id", quoteIds);
  if (error) readFailed(error);
  const map = new Map<string, LineRow[]>();
  for (const row of (data ?? []) as LineRow[]) {
    const list = map.get(row.quote_id) ?? [];
    list.push(row);
    map.set(row.quote_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

function total(lines: LineRow[]) {
  return lines.reduce((sum, line) => sum + Number(line.unit_price) * Number(line.quantity), 0);
}

export const quotesList = defineToolV2({
  name: "quotes.list",
  description:
    "List this workspace's quotes (newest first) with line totals. PII-light: no full emails or phones.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    status: z.string().min(1).max(40).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  run: async (input, context) => {
    const client = db(context);
    const limit = input.limit ?? 50;
    let query = client
      .from("quotes")
      .select(
        "id, customer_name, customer_email, customer_phone, lead_id, appointment_id, status, notes, accepted_at, created_at, updated_at",
      )
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) readFailed(error);
    const rows = (data ?? []) as QuoteRow[];
    const byId = await linesFor(
      client,
      context.organizationId,
      rows.map((r) => r.id),
    );
    const quotes = rows.map((row) => {
      const lines = byId.get(row.id) ?? [];
      return {
        id: row.id,
        customer_name: row.customer_name,
        status: row.status,
        lead_id: row.lead_id,
        appointment_id: row.appointment_id,
        accepted_at: row.accepted_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        line_count: lines.length,
        total: total(lines),
        has_email: Boolean(row.customer_email),
        has_phone: Boolean(row.customer_phone),
      };
    });
    return bounded({ quotes }, "quotes");
  },
});

export const quotesGet = defineToolV2({
  name: "quotes.get",
  description:
    "Get one quote by id for this workspace, including customer contact and line items.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({ quoteId: z.string().uuid() }),
  run: async (input, context) => {
    const client = db(context);
    const { data, error } = await client
      .from("quotes")
      .select(
        "id, customer_name, customer_email, customer_phone, lead_id, appointment_id, status, notes, accepted_at, created_at, updated_at",
      )
      .eq("organization_id", context.organizationId)
      .eq("id", input.quoteId)
      .maybeSingle();
    if (error) readFailed(error);
    if (!data) return { quote: null };
    const row = data as QuoteRow;
    const lines = (await linesFor(client, context.organizationId, [row.id])).get(row.id) ?? [];
    const notes = row.notes && row.notes.length > 400 ? `${row.notes.slice(0, 400)}…` : row.notes;
    return {
      quote: {
        id: row.id,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        lead_id: row.lead_id,
        appointment_id: row.appointment_id,
        status: row.status,
        notes,
        accepted_at: row.accepted_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        total: total(lines),
        lines: lines.map(({ name, unit_price, quantity, sort_order }) => ({
          name,
          unit_price,
          quantity,
          sort_order,
        })),
      },
    };
  },
});
