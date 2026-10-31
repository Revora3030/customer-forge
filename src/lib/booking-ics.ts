/**
 * "Add to calendar" for a requested booking: an .ics file (via `ics`, ISC,
 * https://github.com/adamgibbons/ics) plus a Google Calendar template link.
 *
 * Times are written as floating local times (no time zone): the visitor picked
 * a wall-clock time on the business's own calendar, and a floating event lands
 * at that same wall-clock time in whatever calendar they import it into. The
 * event is TENTATIVE because the business still has to confirm the request.
 * No network calls; works in the browser and on the server.
 */

export interface BookingCalendarInput {
  /** YYYY-MM-DD in the business's calendar. */
  localDate: string;
  /** HH:MM, 24-hour. */
  localTime: string;
  durationMinutes?: number | null;
  businessName: string;
  serviceName?: string | null;
  location?: string | null;
  phone?: string | null;
}

export interface BookingCalendarEvent {
  title: string;
  description: string;
  location: string | null;
  start: [number, number, number, number, number];
  end: [number, number, number, number, number];
  durationMinutes: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

function addMinutes(parts: [number, number, number, number, number], minutes: number) {
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]) + minutes * 60_000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()] as [
    number,
    number,
    number,
    number,
    number,
  ];
}

/** The event to offer, or null when the date/time are not usable. */
export function bookingCalendarEvent(input: BookingCalendarInput): BookingCalendarEvent | null {
  const date = DATE_RE.exec(input.localDate ?? "");
  const time = TIME_RE.exec(input.localTime ?? "");
  if (!date || !time) return null;
  const start: [number, number, number, number, number] = [
    Number(date[1]),
    Number(date[2]),
    Number(date[3]),
    Number(time[1]),
    Number(time[2]),
  ];
  if (start[1] < 1 || start[1] > 12 || start[2] < 1 || start[2] > 31 || start[3] > 23 || start[4] > 59) return null;
  const raw = Number(input.durationMinutes);
  const durationMinutes = Number.isFinite(raw) && raw >= 5 && raw <= 24 * 60 ? Math.round(raw) : 60;
  const business = input.businessName.trim() || "Appointment";
  const service = input.serviceName?.trim();
  const lines = [
    `Requested appointment with ${business}${service ? ` for ${service}` : ""}.`,
    `${business} will confirm this time with you.`,
  ];
  if (input.phone?.trim()) lines.push(`Questions: ${input.phone.trim()}`);
  return {
    title: service ? `Requested: ${service} at ${business}` : `Requested: appointment at ${business}`,
    description: lines.join("\n"),
    location: input.location?.trim() || null,
    start,
    end: addMinutes(start, durationMinutes),
    durationMinutes,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (p: [number, number, number, number, number]) =>
  `${p[0]}${pad(p[1])}${pad(p[2])}T${pad(p[3])}${pad(p[4])}00`;

/** Google Calendar "create event" template link (floating local times). */
export function googleCalendarUrl(event: BookingCalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(event.start)}/${stamp(event.end)}`,
    details: event.description,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** The .ics file body, or null if the library rejects the event. */
export async function bookingIcs(event: BookingCalendarEvent): Promise<string | null> {
  const { createEvent } = await import("ics");
  const { error, value } = createEvent({
    title: event.title,
    description: event.description,
    ...(event.location ? { location: event.location } : {}),
    start: event.start,
    startInputType: "local",
    startOutputType: "local",
    end: event.end,
    endInputType: "local",
    endOutputType: "local",
    status: "TENTATIVE",
    busyStatus: "TENTATIVE",
    productId: "revora/booking",
  });
  if (error || !value) return null;
  return value;
}

/** A safe download name such as "appointment-2026-11-03.ics". */
export function icsFileName(localDate: string): string {
  return `appointment-${DATE_RE.test(localDate) ? localDate : "request"}.ics`;
}
