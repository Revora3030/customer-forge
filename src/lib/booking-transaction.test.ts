import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/* ---- Supabase + server-function doubles ---- */
const rpc = vi.fn();
const from = vi.fn(() => {
  throw new Error("booking must not write tables directly");
});
const queueAutomationEvent = vi.fn(async () => ({ queued: 1, sent: 0, skipped: 0, failed: 0 }));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/lib/automation-queue.functions", () => ({ queueAutomationEvent }));
vi.mock("@/lib/automations.functions", () => ({ runDueAutomations: vi.fn() }));
vi.mock("@/lib/website-review.functions", () => ({ setWebsiteReviewState: vi.fn() }));
vi.mock("@/lib/ui/notify", () => ({ toast }));
const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries }),
}));

const { useCreateAppointment, bookingErrorMessage } = await import("@/lib/queries");

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE = "66666666-6666-4666-8666-666666666666";
type Mutation = {
  mutationFn: (input: Record<string, unknown>) => Promise<string>;
  onError: (error: Error) => void;
};

const base = {
  name: "Pat Lee",
  email: "pat@example.com",
  phone: null,
  startsAt: "2026-10-22T09:00",
  durationMinutes: 90,
  serviceId: "svc-1",
  leadId: null,
  estimatedValue: 350,
};

beforeEach(() => {
  rpc.mockReset();
  queueAutomationEvent.mockClear();
  invalidateQueries.mockClear();
});

describe("Book this job is one transaction", () => {
  it("creates lead, appointment and quote link in a single tenant-scoped RPC", async () => {
    rpc.mockResolvedValue({ data: { appointment_id: "appt-1", lead_id: "lead-1" }, error: null });
    const create = useCreateAppointment(ORG) as unknown as Mutation;
    const id = await create.mutationFn({ ...base, quoteId: QUOTE });
    expect(id).toBe("appt-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe("book_appointment");
    expect(args).toMatchObject({
      p_organization_id: ORG,
      p_quote_id: QUOTE,
      p_lead_id: null,
      p_name: "Pat Lee",
      p_status: "confirmed",
      p_estimated_value: 350,
    });
    expect(new Date(args.p_ends_at).getTime() - new Date(args.p_starts_at).getTime()).toBe(90 * 60_000);
    expect(from).not.toHaveBeenCalled();
    // Follow-ups are queued by the server for the booked appointment only.
    expect(queueAutomationEvent).toHaveBeenCalledWith({
      data: { organizationId: ORG, trigger: "booking_created", leadId: "lead-1", appointmentId: "appt-1" },
    });
  });

  it("an already-booked quote is a clear error and queues nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "quote_already_booked", code: "23505" } });
    const create = useCreateAppointment(ORG) as unknown as Mutation;
    await expect(create.mutationFn({ ...base, quoteId: QUOTE })).rejects.toThrow(/already booked/);
    expect(queueAutomationEvent).not.toHaveBeenCalled();
    // The stale quote list is refreshed so the button disappears.
    create.onError(new Error("This quote is already booked"));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["quotes", ORG] });
  });

  it("maps every booking RPC error code to owner language", () => {
    expect(bookingErrorMessage({ message: "quote_not_accepted" })).toMatch(/accepted quote/);
    expect(bookingErrorMessage({ message: "lead_not_found" })).toMatch(/lead wasn't found/);
    expect(bookingErrorMessage({ message: "not_allowed" })).toMatch(/permission/);
    expect(bookingErrorMessage({ message: "something else" })).toBeNull();
  });

  it("refuses without a workspace or with a bad time, before calling the database", async () => {
    await expect((useCreateAppointment(undefined) as unknown as Mutation).mutationFn(base)).rejects.toThrow(/Workspace/);
    await expect((useCreateAppointment(ORG) as unknown as Mutation).mutationFn({ ...base, startsAt: "nope" })).rejects.toThrow(/valid date/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("book_appointment migration", () => {
  const sql = readFileSync("supabase/migrations/20261021120000_automation_runs_server_queue_and_booking.sql", "utf8");
  const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.book_appointment"));

  it("is SECURITY INVOKER with a fixed search_path and explicit tenant checks", () => {
    expect(fn).toMatch(/SECURITY INVOKER\s+SET search_path = pg_catalog, public/);
    expect(fn).toMatch(/NOT private\.is_org_member\(p_organization_id\)/);
    expect(fn).toMatch(/NOT private\.org_role_at_least\(p_organization_id, 'staff'\)/);
    expect(fn).not.toMatch(/SECURITY DEFINER/);
  });

  it("locks the quote and links it only while it is unbooked, in the same transaction", () => {
    const lock = fn.indexOf("FOR UPDATE;");
    const appointment = fn.indexOf("INSERT INTO public.appointments");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(appointment);
    expect(fn).toMatch(/IF v_quote_appointment IS NOT NULL THEN\s+RAISE EXCEPTION 'quote_already_booked'/);
    expect(fn).toMatch(/AND q\.appointment_id IS NULL;\s+GET DIAGNOSTICS v_rows = ROW_COUNT;\s+IF v_rows = 0 THEN\s+RAISE EXCEPTION 'quote_already_booked'/);
    expect(fn).toMatch(/lead_id = COALESCE\(q\.lead_id, v_lead_id\)/);
    // Lead created only when none is given or on the quote.
    expect(fn).toMatch(/v_lead_id := COALESCE\(p_lead_id, v_quote_lead\);\s+IF v_lead_id IS NULL THEN\s+INSERT INTO public\.leads/);
    // Every write is scoped to the workspace.
    for (const where of ["l.organization_id = p_organization_id", "q.organization_id = p_organization_id"]) {
      expect(fn).toContain(where);
    }
  });

  it("grants execute to signed-in users only", () => {
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION public\.book_appointment\([^)]*\) FROM PUBLIC;/);
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION public\.book_appointment\([^)]*\) FROM anon;/);
    expect(fn).toMatch(/GRANT EXECUTE ON FUNCTION public\.book_appointment\([^)]*\) TO authenticated, service_role;/);
  });
});

describe("automation_runs RLS (migration 20261021120000)", () => {
  const sql = readFileSync("supabase/migrations/20261021120000_automation_runs_server_queue_and_booking.sql", "utf8");

  it("drops the member FOR ALL policy and keeps member SELECT", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS automation_runs_member_all ON public.automation_runs;");
    expect(sql).toMatch(
      /CREATE POLICY automation_runs_member_read ON public\.automation_runs\s+FOR SELECT TO authenticated\s+USING \(private\.is_org_member\(organization_id\)\);/,
    );
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR ALL/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR INSERT/);
  });

  it("browsers cannot insert, and can only cancel (status) as staff+", () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public\.automation_runs FROM authenticated;/);
    expect(sql).toMatch(/GRANT SELECT, DELETE ON public\.automation_runs TO authenticated;/);
    expect(sql).toMatch(/GRANT UPDATE \(status\) ON public\.automation_runs TO authenticated;/);
    expect(sql).not.toMatch(/GRANT [^;]*INSERT[^;]*ON public\.automation_runs TO authenticated/);
    expect(sql).not.toMatch(/GRANT UPDATE \([^)]*(trigger_event|recipient|body|subject|action_type)[^)]*\)/);
    expect(sql).toMatch(
      /CREATE POLICY automation_runs_staff_cancel ON public\.automation_runs\s+FOR UPDATE TO authenticated\s+USING \(private\.org_role_at_least\(organization_id, 'staff'\) AND status = 'queued'\)\s+WITH CHECK \(private\.org_role_at_least\(organization_id, 'staff'\) AND status = 'skipped'\);/,
    );
    expect(sql).toMatch(/REVOKE ALL ON public\.automation_runs FROM anon;/);
    expect(sql).toMatch(/GRANT ALL ON public\.automation_runs TO service_role;/);
  });

  it("is additive and re-runnable", () => {
    expect(sql).not.toMatch(/\b(DROP TABLE|DROP COLUMN|ALTER TABLE public\.\w+ (DROP|ALTER COLUMN))\b/i);
    const created = [...sql.matchAll(/CREATE POLICY (\w+)/g)].map((m) => m[1]);
    for (const policy of created) expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON`);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.book_appointment/);
  });
});
