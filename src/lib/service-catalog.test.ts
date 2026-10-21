import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/* ---- recording Supabase double: every builder call is logged per table ---- */
type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  const record = (op: string, args: unknown[]) => calls.push({ table, op, args });
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "delete", "eq", "not", "order", "limit", "single", "maybeSingle"]) {
    chain[op] = (...args: unknown[]) => {
      record(op, args);
      return chain;
    };
  }
  chain["then"] = (resolve: (value: unknown) => unknown) =>
    resolve(results[table] ?? { data: [], error: null });
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/ui/notify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import {
  bookingFromQuote,
  canOfferBooking,
  cleanLines,
  filterLeadsByService,
  leadServiceId,
  lineFromService,
  quoteTotal,
  reviewOfferFor,
  servicePageFor,
  serviceUsage,
  type CatalogService,
} from "@/lib/service-catalog";
import {
  useDeleteQuote,
  useLinkQuoteBooking,
  useQuoteLineServiceRefs,
  useQuotes,
  useSaveQuote,
  useSetQuoteStatus,
  useWebsitePageRefs,
} from "@/lib/service-catalog.hooks";

const ORG = "11111111-1111-4111-8111-111111111111";

const wash: CatalogService = { id: "svc-wash", name: "Exterior Wash", price: 80, starting_price: null, duration_minutes: 45 };
const detail: CatalogService = { id: "svc-detail", name: "Full Detail", price: null, starting_price: 250, duration_minutes: 180 };
const consult: CatalogService = { id: "svc-consult", name: "Consultation", price: null, starting_price: null, duration_minutes: 0 };
const catalog = [wash, detail, consult];

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
});

describe("(a) quote lines come from the services catalog", () => {
  it("copies name and price, falling back to the starting price", () => {
    expect(lineFromService(wash)).toEqual({
      service_id: "svc-wash",
      name: "Exterior Wash",
      unit_price: 80,
      quantity: 1,
      from_starting_price: false,
    });
    expect(lineFromService(detail)).toMatchObject({ unit_price: 250, from_starting_price: true });
  });

  it("never invents a price for a service that has none", () => {
    expect(lineFromService(consult)).toMatchObject({ unit_price: 0, from_starting_price: false });
  });

  it("keeps owner edits and totals them; blank lines are dropped", () => {
    const edited = { ...lineFromService(wash), name: "Wash + wax", unit_price: 95, quantity: 2 };
    const lines = cleanLines([edited, { service_id: null, name: "  ", unit_price: 10, quantity: 1 }]);
    expect(lines).toEqual([{ service_id: "svc-wash", name: "Wash + wax", unit_price: 95, quantity: 2 }]);
    expect(quoteTotal(lines)).toBe(190);
    expect(quoteTotal([])).toBe(0);
  });

  it("saves the quote and its lines scoped to the workspace", async () => {
    results["quotes"] = { data: { id: "q1" }, error: null };
    results["quote_line_items"] = { data: [{ id: "l1" }], error: null };
    const save = useSaveQuote(ORG) as unknown as { mutationFn: (input: unknown) => Promise<string> };
    const id = await save.mutationFn({
      customer_name: "Pat",
      customer_email: null,
      customer_phone: null,
      lead_id: null,
      notes: null,
      status: "draft",
      lines: [lineFromService(wash)],
    });
    expect(id).toBe("q1");
    const quoteInsert = calls.find((c) => c.table === "quotes" && c.op === "insert");
    expect(quoteInsert?.args[0]).toMatchObject({ organization_id: ORG, customer_name: "Pat" });
    const lineInsert = calls.find((c) => c.table === "quote_line_items" && c.op === "insert");
    expect(lineInsert?.args[0]).toEqual([
      expect.objectContaining({ organization_id: ORG, quote_id: "q1", service_id: "svc-wash", name: "Exterior Wash", unit_price: 80 }),
    ]);
  });

  it("refuses a quote with no lines (empty / no-services state)", async () => {
    const save = useSaveQuote(ORG) as unknown as { mutationFn: (input: unknown) => Promise<string> };
    await expect(
      save.mutationFn({ customer_name: "Pat", customer_email: null, customer_phone: null, lead_id: null, notes: null, status: "draft", lines: [] }),
    ).rejects.toThrow(/at least one line/);
    expect(calls).toHaveLength(0);
  });

  it("editing replaces lines inside the same workspace only", async () => {
    results["quote_line_items"] = { data: [{ id: "new-1" }], error: null };
    const save = useSaveQuote(ORG) as unknown as { mutationFn: (input: unknown) => Promise<string> };
    await save.mutationFn({
      id: "q1",
      customer_name: "Pat",
      customer_email: null,
      customer_phone: null,
      lead_id: null,
      notes: null,
      status: "sent",
      lines: [lineFromService(detail)],
    });
    const update = calls.filter((c) => c.table === "quotes");
    expect(update.map((c) => c.op)).toEqual(["update", "eq", "eq"]);
    expect(update).toContainEqual({ table: "quotes", op: "eq", args: ["organization_id", ORG] });
    const lineOps = calls.filter((c) => c.table === "quote_line_items").map((c) => c.op);
    // insert new first, then delete the old rows
    expect(lineOps.indexOf("insert")).toBeLessThan(lineOps.indexOf("delete"));
    expect(calls).toContainEqual({ table: "quote_line_items", op: "eq", args: ["organization_id", ORG] });
    expect(calls).toContainEqual({ table: "quote_line_items", op: "not", args: ["id", "in", "(new-1)"] });
  });
});

describe("(b) site leads carry the service", () => {
  const leads = [
    { id: "1", service_id: "svc-wash", service_interest: "Exterior Wash" },
    { id: "2", service_id: null, service_interest: "full detail" },
    { id: "3", service_id: null, service_interest: "Something else" },
    { id: "4", service_id: "svc-gone", service_interest: null },
  ];

  it("resolves a lead's service by stored id, else by exact name", () => {
    expect(leads.map((lead) => leadServiceId(lead, catalog))).toEqual(["svc-wash", "svc-detail", null, null]);
  });

  it("filters by service, by no service, or not at all", () => {
    expect(filterLeadsByService(leads, "svc-wash", catalog).map((l) => l.id)).toEqual(["1"]);
    expect(filterLeadsByService(leads, "svc-detail", catalog).map((l) => l.id)).toEqual(["2"]);
    expect(filterLeadsByService(leads, "none", catalog).map((l) => l.id)).toEqual(["3", "4"]);
    expect(filterLeadsByService(leads, "all", catalog)).toHaveLength(4);
    expect(filterLeadsByService(leads, "svc-wash", []).map((l) => l.id)).toEqual([]);
  });

  it("the public enquiry and booking forms already send the picked service id", () => {
    const forms = readFileSync("src/components/site/SiteForms.tsx", "utf8");
    expect(forms).toMatch(/serviceId: service\?\.id \?\? null/);
    expect(forms).toMatch(/serviceId: serviceId \|\| null/);
    const server = readFileSync("src/lib/public-site.functions.ts", "utf8");
    expect(server).toMatch(/service_id: data\.serviceId \|\| null/);
  });
});

describe("(c) accepted quote -> one-click booking", () => {
  const quote = { customer_name: "Pat", customer_email: "p@example.com", customer_phone: null, lead_id: "lead-1" };

  it("is offered only for an accepted, not-yet-booked quote", () => {
    expect(canOfferBooking({ status: "accepted", appointment_id: null })).toBe(true);
    expect(canOfferBooking({ status: "accepted", appointment_id: "appt-1" })).toBe(false);
    expect(canOfferBooking({ status: "sent", appointment_id: null })).toBe(false);
    expect(canOfferBooking({ status: "draft", appointment_id: null })).toBe(false);
  });

  it("sizes the booking from the quoted services' durations", () => {
    const plan = bookingFromQuote(
      quote,
      [
        { service_id: "svc-wash", unit_price: 80, quantity: 1 },
        { service_id: "svc-detail", unit_price: 250, quantity: 1 },
        { service_id: null, unit_price: 20, quantity: 1 },
      ],
      catalog,
    );
    expect(plan).toMatchObject({
      serviceId: "svc-wash",
      durationMinutes: 225,
      durationFromServices: true,
      estimatedValue: 350,
      leadId: "lead-1",
      email: "p@example.com",
    });
  });

  it("falls back to 60 minutes and says so when no quoted service has a length", () => {
    const plan = bookingFromQuote(quote, [{ service_id: null, unit_price: 50, quantity: 1 }], catalog);
    expect(plan).toMatchObject({ serviceId: null, durationMinutes: 60, durationFromServices: false });
  });

  it("status changes and the booking link stay tenant-scoped", async () => {
    const setStatus = useSetQuoteStatus(ORG) as unknown as { mutationFn: (i: unknown) => Promise<void> };
    await setStatus.mutationFn({ id: "q1", status: "accepted" });
    const link = useLinkQuoteBooking(ORG) as unknown as { mutationFn: (i: unknown) => Promise<void> };
    await link.mutationFn({ id: "q1", appointmentId: "appt-9" });
    const updates = calls.filter((c) => c.table === "quotes" && c.op === "update").map((c) => c.args[0]);
    expect(updates[0]).toMatchObject({ status: "accepted" });
    expect(updates[1]).toEqual({ appointment_id: "appt-9" });
    expect(calls.filter((c) => c.op === "eq" && c.args[0] === "organization_id")).toHaveLength(2);
  });

  it("the page books only on the owner's click", () => {
    const ui = readFileSync("src/components/app/OwnerQuotes.tsx", "utf8");
    expect(ui).toMatch(/Book this job/);
    expect(ui).not.toMatch(/useEffect\([^)]*createAppointment/);
  });
});

describe("(d) completed booking -> review request", () => {
  const done = { status: "completed", email: "c@example.com", phone: "+15125550100" };

  it("offers email first, text only without an email", () => {
    expect(reviewOfferFor(done, [])).toEqual({ kind: "offer", channel: "email", recipient: "c@example.com" });
    expect(reviewOfferFor({ ...done, email: null }, [])).toEqual({ kind: "offer", channel: "sms", recipient: "+15125550100" });
    expect(reviewOfferFor({ ...done, email: null, phone: " " }, [])).toEqual({ kind: "no_contact" });
  });

  it("does not offer a second request when the completion automation is on", () => {
    expect(reviewOfferFor(done, [{ trigger_event: "appointment_completed", is_active: true }])).toEqual({ kind: "automated" });
    expect(reviewOfferFor(done, [{ trigger_event: "appointment_completed", is_active: false }]).kind).toBe("offer");
  });

  it("nothing is offered before the job is completed", () => {
    expect(reviewOfferFor({ ...done, status: "confirmed" }, []).kind).toBe("not_completed");
  });

  it("uses the existing review-request queue, not a new sending path", () => {
    const calendar = readFileSync("src/routes/_authenticated/app.calendar.tsx", "utf8");
    expect(calendar).toMatch(/useRequestReview/);
    expect(calendar).not.toMatch(/sendTemplateEmail|sendTwilioSms|deliverRun/);
  });
});

describe("(e) services page usage", () => {
  const pages = [
    { slug: "home", title: "Home", kind: "home", is_visible: true },
    { slug: "services", title: "Services", kind: "services", is_visible: true },
    { slug: "exterior-wash", title: "Exterior Wash", kind: "service", is_visible: true },
    { slug: "full-detail", title: "Full Detail", kind: "service", is_visible: false },
  ];

  it("finds the service's own visible page only", () => {
    expect(servicePageFor(wash, pages)?.slug).toBe("exterior-wash");
    expect(servicePageFor(detail, pages)).toBeNull();
    expect(servicePageFor(consult, pages)).toBeNull();
  });

  it("counts real leads, distinct quotes and non-cancelled bookings", () => {
    const usage = serviceUsage(catalog, {
      leads: [
        { service_id: "svc-wash", service_interest: null },
        { service_id: null, service_interest: "Exterior Wash" },
        { service_id: "svc-detail", service_interest: null },
      ],
      quoteLines: [
        { quote_id: "q1", service_id: "svc-wash" },
        { quote_id: "q1", service_id: "svc-wash" },
        { quote_id: "q2", service_id: "svc-wash" },
        { quote_id: "q3", service_id: "svc-other-org" },
      ],
      appointments: [
        { service_id: "svc-wash", status: "completed" },
        { service_id: "svc-wash", status: "cancelled" },
        { service_id: "svc-detail", status: "confirmed" },
      ],
      pages,
    });
    expect(usage.get("svc-wash")).toMatchObject({ leads: 2, quotes: 2, bookings: 1 });
    expect(usage.get("svc-detail")).toMatchObject({ leads: 1, quotes: 0, bookings: 1, page: null });
    expect(usage.get("svc-consult")).toMatchObject({ leads: 0, quotes: 0, bookings: 0 });
    expect(usage.has("svc-other-org")).toBe(false);
  });

  it("is empty with no services", () => {
    expect(serviceUsage([], { leads: [{ service_id: "x", service_interest: "x" }], quoteLines: [], appointments: [], pages }).size).toBe(0);
  });
});

describe("tenant scoping of every catalog read and write", () => {
  it("reads filter by organization_id", async () => {
    for (const hook of [useQuotes, useQuoteLineServiceRefs, useWebsitePageRefs]) {
      calls.length = 0;
      const query = hook(ORG) as unknown as { queryFn: () => Promise<unknown>; enabled: boolean };
      expect(query.enabled).toBe(true);
      await query.queryFn();
      expect(calls).toContainEqual(expect.objectContaining({ op: "eq", args: ["organization_id", ORG] }));
    }
  });

  it("reads are disabled until a workspace is known", () => {
    expect((useQuotes(undefined) as unknown as { enabled: boolean }).enabled).toBe(false);
  });

  it("delete is scoped too", async () => {
    const remove = useDeleteQuote(ORG) as unknown as { mutationFn: (id: string) => Promise<void> };
    await remove.mutationFn("q1");
    expect(calls).toContainEqual({ table: "quotes", op: "eq", args: ["organization_id", ORG] });
  });

  it("the migration is additive with RLS and grants matching sibling tables", () => {
    const sql = readFileSync("supabase/migrations/20261021100000_owner_quotes_from_services.sql", "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.quotes/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.quote_line_items/);
    expect(sql).not.toMatch(/\b(DROP TABLE|DROP COLUMN|ALTER TABLE public\.(leads|services|appointments))\b/i);
    for (const table of ["quotes", "quote_line_items"]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated`);
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM anon`);
      expect(sql).toMatch(new RegExp(`${table}_member_read ON public\\.${table}\\s+FOR SELECT TO authenticated USING \\(private\\.is_org_member\\(organization_id\\)\\)`));
    }
    expect(sql).toMatch(/quote_line_items_service_same_org_fkey FOREIGN KEY \(service_id, organization_id\)/);
    expect(sql).toMatch(/quotes_lead_same_org_fkey FOREIGN KEY \(lead_id, organization_id\)/);
  });
});
