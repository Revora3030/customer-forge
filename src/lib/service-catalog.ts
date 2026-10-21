/**
 * One services catalog for every customer-app module (quotes, leads, calendar,
 * reviews, services). Pure helpers only: no I/O, so each page's tenant-scoped
 * queries feed them and the tests can pin the rules down.
 *
 * Truth rules: numbers are counted from the rows passed in, never estimated;
 * a service without a price contributes 0 rather than an invented amount; a
 * website page only counts as the service's page when its slug or title
 * really names that service.
 */
import { slugify } from "@/lib/format";

export type CatalogService = {
  id: string;
  name: string;
  price: number | null;
  starting_price: number | null;
  duration_minutes: number | null;
  is_active?: boolean;
};

export type QuoteLineDraft = {
  service_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  /** True when the price came from the service's "starting at" figure. */
  from_starting_price?: boolean;
};

/**
 * A line while it is being edited: price and quantity keep exactly what the
 * owner typed ("12.", "0.5", "1,250.00") and are parsed only on save, so a
 * decimal point is never swallowed mid-typing.
 */
export type EditableQuoteLine = Omit<QuoteLineDraft, "unit_price" | "quantity"> & {
  unit_price: string;
  quantity: string;
};

/** A typed amount as a number: "$1,250.50" -> 1250.5; blank -> null; junk -> NaN. */
export function parseAmount(text: string | number | null | undefined): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : Number.NaN;
  const raw = String(text ?? "")
    .trim()
    .replace(/^\$\s*/, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "");
  if (!raw) return null;
  if (!/^\d*\.?\d*$/.test(raw) || raw === ".") return Number.NaN;
  return Number(raw);
}

export const editableLine = (line: QuoteLineDraft): EditableQuoteLine => ({
  ...line,
  unit_price: String(line.unit_price),
  quantity: String(line.quantity),
});

/**
 * Parses edited lines for saving. A blank price is 0 and a blank quantity 1;
 * anything that isn't a number is reported by line instead of silently
 * becoming 0 or 1.
 */
export function parseEditableLines(
  lines: EditableQuoteLine[],
): { ok: true; lines: QuoteLineDraft[] } | { ok: false; error: string } {
  const parsed: QuoteLineDraft[] = [];
  for (const [index, line] of lines.entries()) {
    const label = line.name.trim() || `Line ${index + 1}`;
    const price = parseAmount(line.unit_price);
    const quantity = parseAmount(line.quantity);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return { ok: false, error: `${label}: the price isn't a number.` };
    }
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      return { ok: false, error: `${label}: the quantity must be a number above 0.` };
    }
    parsed.push({
      service_id: line.service_id,
      name: line.name,
      unit_price: price ?? 0,
      quantity: quantity ?? 1,
    });
  }
  return { ok: true, lines: parsed };
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export const QUOTE_STATUSES: { value: QuoteStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

/** A fresh line copied from a catalog service. The owner can edit it after. */
export function lineFromService(service: CatalogService): QuoteLineDraft {
  const hasPrice = service.price !== null && service.price !== undefined;
  const price = hasPrice ? Number(service.price) : Number(service.starting_price ?? 0);
  return {
    service_id: service.id,
    name: service.name,
    unit_price: Number.isFinite(price) && price > 0 ? price : 0,
    quantity: 1,
    from_starting_price: !hasPrice && service.starting_price !== null && service.starting_price !== undefined,
  };
}

const money = (value: number) => Math.round(value * 100) / 100;

export function quoteTotal(lines: { unit_price: number | string; quantity: number | string }[]): number {
  return money(
    lines.reduce((sum, line) => {
      const price = Number(line.unit_price);
      const qty = Number(line.quantity);
      return sum + (Number.isFinite(price) && Number.isFinite(qty) ? price * qty : 0);
    }, 0),
  );
}

/** Lines ready to save: blank names dropped, money and quantities clamped. */
export function cleanLines(lines: QuoteLineDraft[]): QuoteLineDraft[] {
  return lines
    .map((line) => ({
      service_id: line.service_id,
      name: line.name.trim().slice(0, 160),
      unit_price: Math.max(0, money(Number(line.unit_price) || 0)),
      quantity: Math.max(0.01, money(Number(line.quantity) || 1)),
    }))
    .filter((line) => line.name.length > 0);
}

/** Only an accepted quote that has not been booked yet offers the booking. */
export function canOfferBooking(quote: { status: string; appointment_id: string | null }): boolean {
  return quote.status === "accepted" && !quote.appointment_id;
}

export const DEFAULT_BOOKING_MINUTES = 60;

/**
 * What the one-click "Book this job" pre-fills from an accepted quote. The
 * length is the sum of each quoted service's catalog duration times its line
 * quantity (two washes take twice as long), in whole minutes; with no
 * catalog service on the quote it falls back to the calendar's 60 minutes and
 * says so (`durationFromServices: false`).
 */
export function bookingFromQuote(
  quote: {
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    lead_id: string | null;
  },
  lines: { service_id: string | null; unit_price: number | string; quantity: number | string }[],
  services: CatalogService[],
) {
  const byId = new Map(services.map((service) => [service.id, service]));
  const quoted = lines.flatMap((line) => {
    const service = line.service_id ? byId.get(line.service_id) : undefined;
    if (!service) return [];
    const quantity = Number(line.quantity);
    return [{ service, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 }];
  });
  const minutes = Math.round(
    quoted.reduce(
      (sum, { service, quantity }) => sum + Math.max(0, Number(service.duration_minutes ?? 0)) * quantity,
      0,
    ),
  );
  return {
    name: quote.customer_name,
    email: quote.customer_email,
    phone: quote.customer_phone,
    leadId: quote.lead_id,
    serviceId: quoted[0]?.service.id ?? null,
    durationMinutes: minutes > 0 ? minutes : DEFAULT_BOOKING_MINUTES,
    durationFromServices: minutes > 0,
    estimatedValue: quoteTotal(lines),
  };
}

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/**
 * Which catalog service a lead is about: the stored service id first; a lead
 * without one (typed by hand, or from before ids were stored) matches only a
 * service whose exact name it carries.
 */
export function leadServiceId(
  lead: { service_id: string | null; service_interest: string | null },
  services: CatalogService[],
): string | null {
  if (lead.service_id && services.some((service) => service.id === lead.service_id)) return lead.service_id;
  const interest = norm(lead.service_interest);
  if (!interest) return null;
  return services.find((service) => norm(service.name) === interest)?.id ?? null;
}

export type ServiceFilter = "all" | "none" | string;

export function filterLeadsByService<T extends { service_id: string | null; service_interest: string | null }>(
  leads: T[],
  filter: ServiceFilter,
  services: CatalogService[],
): T[] {
  if (filter === "all") return leads;
  return leads.filter((lead) => {
    const id = leadServiceId(lead, services);
    return filter === "none" ? id === null : id === filter;
  });
}

export type SitePageRef = { slug: string; title: string; kind: string; is_visible: boolean };

/** The visible website page dedicated to this service, if one exists. */
export function servicePageFor(service: CatalogService, pages: SitePageRef[]): SitePageRef | null {
  const slug = slugify(service.name);
  const name = norm(service.name);
  if (!slug && !name) return null;
  return (
    pages.find(
      (page) =>
        page.is_visible &&
        page.kind !== "home" &&
        page.kind !== "services" &&
        (page.slug === slug || page.slug.split("/").pop() === slug || norm(page.title) === name),
    ) ?? null
  );
}

export type ServiceUsage = {
  leads: number;
  quotes: number;
  bookings: number;
  page: SitePageRef | null;
};

/** Per-service counts from the workspace's own rows. */
export function serviceUsage(
  services: CatalogService[],
  rows: {
    leads: { service_id: string | null; service_interest: string | null }[];
    quoteLines: { quote_id: string; service_id: string | null }[];
    appointments: { service_id: string | null; status: string }[];
    pages: SitePageRef[];
  },
): Map<string, ServiceUsage> {
  const usage = new Map<string, ServiceUsage>(
    services.map((service) => [
      service.id,
      { leads: 0, quotes: 0, bookings: 0, page: servicePageFor(service, rows.pages) },
    ]),
  );
  for (const lead of rows.leads) {
    const id = leadServiceId(lead, services);
    const entry = id ? usage.get(id) : undefined;
    if (entry) entry.leads += 1;
  }
  const quoted = new Map<string, Set<string>>();
  for (const line of rows.quoteLines) {
    if (!line.service_id || !usage.has(line.service_id)) continue;
    const set = quoted.get(line.service_id) ?? new Set<string>();
    set.add(line.quote_id);
    quoted.set(line.service_id, set);
  }
  for (const [id, set] of quoted) usage.get(id)!.quotes = set.size;
  for (const appointment of rows.appointments) {
    if (appointment.status === "cancelled") continue;
    const entry = appointment.service_id ? usage.get(appointment.service_id) : undefined;
    if (entry) entry.bookings += 1;
  }
  return usage;
}

export type ReviewOffer =
  | { kind: "not_completed" }
  | { kind: "automated"; channel: "email" | "sms" }
  | { kind: "no_contact" }
  | { kind: "offer"; channel: "email" | "sms"; recipient: string; needsOptIn: boolean };

export type ReviewAutomation = {
  trigger_event: string;
  is_active: boolean;
  automation_steps?: { action_type: string | null; channel?: string | null }[] | null;
};

/**
 * After a booking is completed: an active "appointment completed" automation
 * only counts as following up when one of its steps can actually reach this
 * customer — an email step with an email on file, or a text step to a number
 * with a recorded SMS opt-in (review texts need one, and a business's own
 * customers rarely have it). Only then is the manual offer hidden, so nobody
 * is messaged twice and nobody is silently skipped.
 * Otherwise the owner is offered one click: email first; a text only without
 * an email, flagged `needsOptIn` because the server enforces STOP, opt-in and
 * quiet hours and will not text a review request without the opt-in.
 */
export function reviewOfferFor(
  appointment: { status: string; email: string | null; phone: string | null },
  automations: ReviewAutomation[],
  options: { hasSmsOptIn?: (phone: string) => boolean } = {},
): ReviewOffer {
  if (appointment.status !== "completed") return { kind: "not_completed" };
  const email = appointment.email?.trim() || null;
  const phone = appointment.phone?.trim() || null;
  const optedIn = (value: string | null) => Boolean(value && options.hasSmsOptIn?.(value));
  for (const automation of automations) {
    if (!automation.is_active || automation.trigger_event !== "appointment_completed") continue;
    for (const step of automation.automation_steps ?? []) {
      const channel = step.channel ?? step.action_type;
      if (channel === "email" && email) return { kind: "automated", channel: "email" };
      if (channel === "sms" && optedIn(phone)) return { kind: "automated", channel: "sms" };
    }
  }
  if (email) return { kind: "offer", channel: "email", recipient: email, needsOptIn: false };
  if (phone) return { kind: "offer", channel: "sms", recipient: phone, needsOptIn: !optedIn(phone) };
  return { kind: "no_contact" };
}
