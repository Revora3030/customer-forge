import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/* ---- recording Supabase double: every builder call is logged per table ---- */
type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  const record = (op: string, args: unknown[]) => calls.push({ table, op, args });
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "delete", "eq", "in", "not", "order", "limit", "single", "maybeSingle"]) {
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
  supabase: {
    from: (table: string) => builder(table),
    rpc: (name: string, args: unknown) => {
      calls.push({ table: `rpc:${name}`, op: "rpc", args: [args] });
      return Promise.resolve(results[`rpc:${name}`] ?? { data: null, error: null });
    },
  },
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
  editableLine,
  filterLeadsByService,
  leadServiceId,
  lineFromService,
  parseAmount,
  parseEditableLines,
  quoteTotal,
  reviewOfferFor,
  servicePageFor,
  serviceUsage,
  type CatalogService,
} from "@/lib/service-catalog";
import {
  useDeleteQuote,
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

  it("saves the quote and its lines in one tenant-checked RPC call", async () => {
    results["rpc:save_owner_quote"] = { data: "q1", error: null };
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
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "rpc:save_owner_quote", op: "rpc" });
    expect(calls[0]!.args[0]).toMatchObject({
      p_organization_id: ORG,
      p_quote_id: null,
      p_customer_name: "Pat",
      p_status: "draft",
      p_lines: [{ service_id: "svc-wash", name: "Exterior Wash", unit_price: 80, quantity: 1, sort_order: 0 }],
    });
    // accepted_at is owned by the database trigger, never sent by the client.
    expect(JSON.stringify(calls[0]!.args[0])).not.toMatch(/accepted_at/);
  });

  it("refuses a quote with no lines (empty / no-services state)", async () => {
    const save = useSaveQuote(ORG) as unknown as { mutationFn: (input: unknown) => Promise<string> };
    await expect(
      save.mutationFn({ customer_name: "Pat", customer_email: null, customer_phone: null, lead_id: null, notes: null, status: "draft", lines: [] }),
    ).rejects.toThrow(/at least one line/);
    expect(calls).toHaveLength(0);
  });

  it("editing updates the same quote and replaces its lines atomically (no doubled lines)", async () => {
    results["rpc:save_owner_quote"] = { data: "q1", error: null };
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
    // One call: no separate insert-then-delete round trips that could half-apply.
    expect(calls.map((c) => c.table)).toEqual(["rpc:save_owner_quote"]);
    expect(calls[0]!.args[0]).toMatchObject({ p_organization_id: ORG, p_quote_id: "q1", p_status: "sent" });
  });

  it("reports a refused or other-workspace quote in owner language", async () => {
    results["rpc:save_owner_quote"] = { data: null, error: { message: "quote_not_found" } };
    const save = useSaveQuote(ORG) as unknown as { mutationFn: (input: unknown) => Promise<string> };
    await expect(
      save.mutationFn({ id: "q-other-org", customer_name: "Pat", customer_email: null, customer_phone: null, lead_id: null, notes: null, status: "draft", lines: [lineFromService(wash)] }),
    ).rejects.toThrow(/wasn't found, or you can't edit it/);
  });

  it("the save RPC is transactional, tenant-checked and replaces lines in place", () => {
    const sql = readFileSync("supabase/migrations/20261021100000_owner_quotes_from_services.sql", "utf8");
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.save_owner_quote"));
    expect(fn).toMatch(/SECURITY INVOKER/);
    expect(fn).toMatch(/SET search_path = pg_catalog, public/);
    expect(fn).toMatch(/private\.org_role_at_least\(p_organization_id, 'staff'\)/);
    expect(fn).toMatch(/WHERE q\.id = p_quote_id\s+AND q\.organization_id = p_organization_id/);
    expect(fn).toMatch(/DELETE FROM public\.quote_line_items AS li\s+WHERE li\.quote_id = v_quote_id\s+AND li\.organization_id = p_organization_id/);
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION public\.save_owner_quote\([^)]*\) FROM anon/);
    expect(fn).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_owner_quote\([^)]*\) TO authenticated, service_role/);
  });

  it("the editor keeps the saved id on the draft", () => {
    const ui = readFileSync("src/components/app/OwnerQuotes.tsx", "utf8");
    expect(ui).toMatch(/onSuccess: \(id\) => \{[\s\S]*?\{ \.\.\.current, id \}/);
  });
});

describe("price and quantity accept decimals", () => {
  it("keeps the typed text and parses it only on save", () => {
    expect(parseAmount("12.")).toBe(12);
    expect(parseAmount("0.5")).toBe(0.5);
    expect(parseAmount("$1,250.75")).toBe(1250.75);
    expect(parseAmount("")).toBeNull();
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
    expect(Number.isNaN(parseAmount("."))).toBe(true);
    const line = editableLine(lineFromService(wash));
    expect(line).toMatchObject({ unit_price: "80", quantity: "1" });
    const parsed = parseEditableLines([{ ...line, unit_price: "79.99", quantity: "1.5" }]);
    expect(parsed).toEqual({ ok: true, lines: [{ service_id: "svc-wash", name: "Exterior Wash", unit_price: 79.99, quantity: 1.5 }] });
  });

  it("blank price is 0 and blank quantity 1; junk is reported per line", () => {
    expect(parseEditableLines([{ service_id: null, name: "Haul", unit_price: "", quantity: "" }])).toEqual({
      ok: true,
      lines: [{ service_id: null, name: "Haul", unit_price: 0, quantity: 1 }],
    });
    expect(parseEditableLines([{ service_id: null, name: "Haul", unit_price: "12a", quantity: "1" }])).toEqual({
      ok: false,
      error: "Haul: the price isn't a number.",
    });
    expect(parseEditableLines([{ service_id: null, name: "", unit_price: "1", quantity: "0" }])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Line 1: the quantity/),
    });
  });

  it("the editor stores raw text instead of coercing on every keystroke", () => {
    const ui = readFileSync("src/components/app/OwnerQuotes.tsx", "utf8");
    expect(ui).toMatch(/unit_price: e\.target\.value/);
    expect(ui).toMatch(/quantity: e\.target\.value/);
    expect(ui).not.toMatch(/Number\(e\.target\.value/);
    expect(ui).toMatch(/parseEditableLines\(draft\.lines\)/);
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

  it("sizes the booking from each service's duration times its quantity", () => {
    const plan = bookingFromQuote(
      quote,
      [
        { service_id: "svc-wash", unit_price: 80, quantity: 2 },
        { service_id: "svc-detail", unit_price: 250, quantity: "1.5" },
      ],
      catalog,
    );
    // 45 * 2 + 180 * 1.5
    expect(plan).toMatchObject({ durationMinutes: 360, durationFromServices: true, estimatedValue: 535 });
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

  it("status changes stay tenant-scoped and never send accepted_at", async () => {
    results["quotes"] = { data: [{ id: "q1" }], error: null };
    const setStatus = useSetQuoteStatus(ORG) as unknown as { mutationFn: (i: unknown) => Promise<void> };
    await setStatus.mutationFn({ id: "q1", status: "accepted" });
    const updates = calls.filter((c) => c.table === "quotes" && c.op === "update").map((c) => c.args[0]);
    expect(updates).toEqual([{ status: "accepted" }]);
    expect(calls).toContainEqual({ table: "quotes", op: "eq", args: ["organization_id", ORG] });
  });

  it("a refused status change is reported, not silently ignored", async () => {
    results["quotes"] = { data: [], error: null };
    const setStatus = useSetQuoteStatus(ORG) as unknown as { mutationFn: (i: unknown) => Promise<void> };
    await expect(setStatus.mutationFn({ id: "q1", status: "sent" })).rejects.toThrow(/permission/);
  });

  it("accepted_at is set only on the transition to accepted", () => {
    const sql = readFileSync("supabase/migrations/20261021100000_owner_quotes_from_services.sql", "utf8");
    expect(sql).toMatch(
      /IF TG_OP = 'INSERT' OR OLD\.status IS DISTINCT FROM 'accepted' THEN\s+NEW\.accepted_at := now\(\);\s+ELSE\s+NEW\.accepted_at := OLD\.accepted_at;/,
    );
    expect(sql).toMatch(/CREATE TRIGGER quotes_track_accepted_at BEFORE INSERT OR UPDATE OF status, accepted_at ON public\.quotes/);
    const hooks = readFileSync("src/lib/service-catalog.hooks.ts", "utf8");
    expect(hooks).not.toMatch(/accepted_at:/);
  });

  it("booking a quote goes through the one transactional booking RPC and hides the button at once", () => {
    const ui = readFileSync("src/components/app/OwnerQuotes.tsx", "utf8");
    expect(ui).toMatch(/quoteId,\n\s+\},/);
    expect(ui).not.toMatch(/useLinkQuoteBooking|linkBooking/);
    expect(ui).toMatch(/canOfferBooking\(quote\) && !bookedIds\.has\(quote\.id\)/);
    expect(ui).toMatch(/setBookedIds\(\(current\) => new Set\(current\)\.add\(quoteId\)\)/);
  });

  it("the page books only on the owner's click", () => {
    const ui = readFileSync("src/components/app/OwnerQuotes.tsx", "utf8");
    expect(ui).toMatch(/Book this job/);
    expect(ui).not.toMatch(/useEffect\([^)]*createAppointment/);
  });
});

describe("(d) completed booking -> review request", () => {
  const done = { status: "completed", email: "c@example.com", phone: "+15125550100" };
  const smsOnly = {
    trigger_event: "appointment_completed",
    is_active: true,
    automation_steps: [{ action_type: "sms", channel: "sms" }],
  };
  const withEmail = {
    trigger_event: "appointment_completed",
    is_active: true,
    automation_steps: [
      { action_type: "sms", channel: "sms" },
      { action_type: "email", channel: null },
    ],
  };

  it("offers email first, text only without an email (flagged as needing opt-in)", () => {
    expect(reviewOfferFor(done, [])).toEqual({ kind: "offer", channel: "email", recipient: "c@example.com", needsOptIn: false });
    expect(reviewOfferFor({ ...done, email: null }, [])).toEqual({
      kind: "offer",
      channel: "sms",
      recipient: "+15125550100",
      needsOptIn: true,
    });
    expect(reviewOfferFor({ ...done, email: null }, [], { hasSmsOptIn: () => true })).toMatchObject({
      channel: "sms",
      needsOptIn: false,
    });
    expect(reviewOfferFor({ ...done, email: null, phone: " " }, [])).toEqual({ kind: "no_contact" });
  });

  it("counts the completion automation only when a step can actually deliver", () => {
    // An email step with an email on file delivers.
    expect(reviewOfferFor(done, [withEmail])).toEqual({ kind: "automated", channel: "email" });
    // A text-only automation can't reach a customer without a recorded opt-in,
    // so the manual email offer stays visible.
    expect(reviewOfferFor(done, [smsOnly])).toMatchObject({ kind: "offer", channel: "email" });
    expect(reviewOfferFor(done, [smsOnly], { hasSmsOptIn: (p) => p === "+15125550100" })).toEqual({
      kind: "automated",
      channel: "sms",
    });
    // Email step but no email on file: it can't deliver either.
    expect(reviewOfferFor({ ...done, email: null }, [withEmail])).toMatchObject({
      kind: "offer",
      channel: "sms",
      needsOptIn: true,
    });
    // Inactive, another trigger, or no steps loaded: nothing is automated.
    expect(reviewOfferFor(done, [{ ...withEmail, is_active: false }]).kind).toBe("offer");
    expect(reviewOfferFor(done, [{ ...withEmail, trigger_event: "booking_created" }]).kind).toBe("offer");
    expect(reviewOfferFor(done, [{ trigger_event: "appointment_completed", is_active: true }]).kind).toBe("offer");
  });

  it("nothing is offered before the job is completed", () => {
    expect(reviewOfferFor({ ...done, status: "confirmed" }, []).kind).toBe("not_completed");
  });

  it("uses the server review-request queue and remembers requests from saved runs", () => {
    const calendar = readFileSync("src/routes/_authenticated/app.calendar.tsx", "utf8");
    expect(calendar).toMatch(/useRequestReview/);
    expect(calendar).not.toMatch(/sendTemplateEmail|sendTwilioSms|deliverRun/);
    expect(calendar).not.toMatch(/askedIds|setAskedIds/);
    expect(calendar).toMatch(/useReviewRequestedAppointments\(orgId\)/);
    expect(calendar).toMatch(/requestReview\.mutate\(\{ appointmentId: appt\.id, channel: offer\.channel \}\)/);
    expect(calendar).toMatch(/Texting needs the customer's opt-in/);
  });

  it("the calendar shows QueryErrorNotice instead of an empty week and $0 on a failed read", () => {
    const calendar = readFileSync("src/routes/_authenticated/app.calendar.tsx", "utf8");
    const errorAt = calendar.indexOf("{appointmentsError ? (");
    expect(errorAt).toBeGreaterThan(-1);
    expect(errorAt).toBeLessThan(calendar.indexOf('label="Jobs this week"'));
    expect(errorAt).toBeLessThan(calendar.indexOf('label="Booked value this week"'));
    expect(errorAt).toBeLessThan(calendar.indexOf("days.map((day, index)"));
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

  it("delete is scoped too, and checks a row was really deleted", async () => {
    results["quotes"] = { data: [{ id: "q1" }], error: null };
    const remove = useDeleteQuote(ORG) as unknown as { mutationFn: (id: string) => Promise<void> };
    await remove.mutationFn("q1");
    expect(calls).toContainEqual({ table: "quotes", op: "eq", args: ["organization_id", ORG] });
    expect(calls).toContainEqual({ table: "quotes", op: "select", args: ["id"] });
  });

  it("a delete RLS refused (0 rows) is 'not allowed', never 'Quote deleted'", async () => {
    results["quotes"] = { data: [], error: null };
    const remove = useDeleteQuote(ORG) as unknown as { mutationFn: (id: string) => Promise<void> };
    await expect(remove.mutationFn("q1")).rejects.toThrow(/only managers and owners can delete/);
  });

  it("delete is hidden below manager and asks for confirmation", () => {
    const ui = readFileSync("src/components/app/OwnerQuotes.tsx", "utf8");
    expect(ui).toMatch(/\{canDelete \? \(/);
    expect(ui).toMatch(/onClick=\{\(\) => setDeleting\(/);
    expect(ui).toMatch(/AlertDialogAction/);
    expect(ui).not.toMatch(/onClick=\{\(\) => remove\.mutate\(quote\.id\)\}/);
    const page = readFileSync("src/routes/_authenticated/app.quotes.tsx", "utf8");
    expect(page).toMatch(/canDelete=\{canManage\(ws\?\.workspace\?\.role\)\}/);
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
