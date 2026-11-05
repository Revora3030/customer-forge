/**
 * bookings.list_upcoming / bookings.find_gaps: read-only. Upcoming list uses
 * the same appointments query as the Calendar page (queries.useAppointments).
 * Gaps are open windows from business_profiles.hours minus booked time.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { readWeeklyHours } from "@/lib/booking-hours";
import { bounded, db, readFailed } from "./shared";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type Appt = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  service_id: string | null;
  lead_id: string | null;
};

const ACTIVE = new Set(["pending", "confirmed"]);

function ymdUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

function minutesUtc(iso: string) {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Pure: open gaps for one UTC calendar day. Exported for tests. */
export function gapsForDay(input: {
  date: string;
  open: number;
  close: number;
  booked: Array<{ start: number; end: number }>;
  minMinutes: number;
}): Array<{ date: string; start: string; end: string; minutes: number }> {
  const sorted = [...input.booked]
    .map((b) => ({
      start: Math.max(input.open, Math.min(b.start, input.close)),
      end: Math.max(input.open, Math.min(b.end, input.close)),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const gaps: Array<{ date: string; start: string; end: string; minutes: number }> = [];
  let cursor = input.open;
  const push = (from: number, to: number) => {
    const minutes = to - from;
    if (minutes < input.minMinutes) return;
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    gaps.push({ date: input.date, start: fmt(from), end: fmt(to), minutes });
  };
  for (const block of sorted) {
    if (block.start > cursor) push(cursor, block.start);
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < input.close) push(cursor, input.close);
  return gaps;
}

export const bookingsListUpcoming = () =>
  defineToolV2({
  name: "bookings.list_upcoming",
  description:
    "List upcoming bookings for this workspace (from now, soonest first). PII-light: no full emails or phones.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    limit: z.number().int().min(1).max(50).optional(),
    includeCancelled: z.boolean().optional(),
  }),
  run: async (input, context) => {
    const limit = input.limit ?? 50;
    const now = new Date().toISOString();
    let query = db(context)
      .from("appointments")
      .select("id, name, email, phone, starts_at, ends_at, status, notes, service_id, lead_id")
      .eq("organization_id", context.organizationId)
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (!input.includeCancelled) query = query.neq("status", "cancelled");
    const { data, error } = await query;
    if (error) readFailed(error);
    const bookings = ((data ?? []) as Appt[]).map((row) => ({
      id: row.id,
      name: row.name,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      status: row.status,
      service_id: row.service_id,
      lead_id: row.lead_id,
      has_email: Boolean(row.email),
      has_phone: Boolean(row.phone),
      has_notes: Boolean(row.notes),
    }));
    return bounded({ bookings }, "bookings");
  },
});

export const bookingsFindGaps = () =>
  defineToolV2({
  name: "bookings.find_gaps",
  description:
    "Find open booking windows over the next few days from stored opening hours minus confirmed/pending appointments. Times are UTC clock from the stored timestamps.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    days: z.number().int().min(1).max(14).optional(),
    minMinutes: z.number().int().min(15).max(480).optional(),
  }),
  run: async (input, context) => {
    const client = db(context);
    const days = input.days ?? 7;
    const minMinutes = input.minMinutes ?? 60;
    const [{ data: profile, error: profileError }, { data: appts, error: apptError }] =
      await Promise.all([
        client
          .from("business_profiles")
          .select("hours")
          .eq("organization_id", context.organizationId)
          .maybeSingle(),
        client
          .from("appointments")
          .select("starts_at, ends_at, status")
          .eq("organization_id", context.organizationId)
          .gte("starts_at", new Date().toISOString())
          .lt(
            "starts_at",
            new Date(Date.now() + days * 86_400_000).toISOString(),
          ),
      ]);
    if (profileError) readFailed(profileError);
    if (apptError) readFailed(apptError);
    const weekly = readWeeklyHours((profile as { hours?: unknown } | null)?.hours);
    if (!Object.keys(weekly).length) {
      return {
        gaps: [],
        total: 0,
        truncated: false,
        note: "No readable opening hours are stored for this workspace.",
      };
    }
    const active = ((appts ?? []) as Array<{ starts_at: string; ends_at: string; status: string }>).filter(
      (a) => ACTIVE.has(a.status),
    );
    const gaps: Array<{ date: string; start: string; end: string; minutes: number }> = [];
    const startDay = new Date();
    startDay.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i < days; i += 1) {
      const day = new Date(startDay.getTime() + i * 86_400_000);
      const date = ymdUtc(day);
      const key = DAY_KEYS[day.getUTCDay()]!;
      const hours = weekly[key];
      if (!hours || hours.closed) continue;
      const booked = active
        .filter((a) => a.starts_at.slice(0, 10) === date)
        .map((a) => ({ start: minutesUtc(a.starts_at), end: minutesUtc(a.ends_at) }));
      gaps.push(
        ...gapsForDay({
          date,
          open: hours.open,
          close: hours.close,
          booked,
          minMinutes,
        }),
      );
    }
    return bounded({ gaps, note: "Gap times use the UTC clock of stored appointment timestamps." }, "gaps");
  },
});
