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
 * length is the sum of the catalog durations of the quoted services; with no
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
  const quoted = lines
    .map((line) => (line.service_id ? byId.get(line.service_id) : undefined))
    .filter((service): service is CatalogService => Boolean(service));
  const minutes = quoted.reduce((sum, service) => sum + Math.max(0, Number(service.duration_minutes ?? 0)), 0);
  return {
    name: quote.customer_name,
    email: quote.customer_email,
    phone: quote.customer_phone,
    leadId: quote.lead_id,
    serviceId: quoted[0]?.id ?? null,
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
  | { kind: "automated" }
  | { kind: "no_contact" }
  | { kind: "offer"; channel: "email" | "sms"; recipient: string };

/**
 * After a booking is completed: when an active "appointment completed"
 * automation exists, completing it already queued the request, so no second
 * manual offer is shown (it would message the customer twice). Otherwise the
 * owner is offered one click. Email is preferred; a text is offered only when
 * there is no email, and the server still enforces STOP, opt-in and quiet hours.
 */
export function reviewOfferFor(
  appointment: { status: string; email: string | null; phone: string | null },
  automations: { trigger_event: string; is_active: boolean }[],
): ReviewOffer {
  if (appointment.status !== "completed") return { kind: "not_completed" };
  if (automations.some((automation) => automation.is_active && automation.trigger_event === "appointment_completed")) {
    return { kind: "automated" };
  }
  const email = appointment.email?.trim();
  if (email) return { kind: "offer", channel: "email", recipient: email };
  const phone = appointment.phone?.trim();
  if (phone) return { kind: "offer", channel: "sms", recipient: phone };
  return { kind: "no_contact" };
}
