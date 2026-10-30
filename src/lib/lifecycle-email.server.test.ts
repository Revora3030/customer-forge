import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTemplateEmail = vi.fn(async (..._args: unknown[]) => ({ sent: true as const }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: (...args: unknown[]) => sendTemplateEmail(...args) }));

import { isTestInbox, planLifecycleEmails, runLifecycleEmails, unsubscribeLifecycleByToken } from "./lifecycle-email.server";
import { PLATFORM_OWNER_ORG_ID } from "./platform-owner";

type Row = Record<string, unknown>;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/** Minimal in-memory PostgREST stand-in for the calls the lifecycle job makes. */
function fakeDb(tables: Record<string, Row[]>) {
  const unique: Record<string, string[][]> = {
    lifecycle_email_log: [["organization_id", "kind", "window_key"]],
    lifecycle_email_optouts: [["email"], ["token"]],
  };
  const from = (table: string) => {
    let op: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    let cap = Infinity;
    const preds: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ??= []);
    const run = () => {
      const hit = rows().filter((r) => preds.every((p) => p(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      if (op === "delete") tables[table] = rows().filter((r) => !hit.includes(r));
      return { data: hit.slice(0, cap).map((r) => ({ ...r })), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: (n: number) => ((cap = n), chain),
      eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), chain),
      in: (c: string, v: unknown[]) => (preds.push((r) => v.includes(r[c])), chain),
      gte: (c: string, v: string) => (preds.push((r) => String(r[c]) >= v), chain),
      not: (c: string, _op: string, v: unknown) => (preds.push((r) => (r[c] ?? null) !== v), chain),
      update: (p: Row) => ((op = "update"), (patch = p), chain),
      delete: () => ((op = "delete"), chain),
      insert: (row: Row) => {
        const clash = (unique[table] ?? []).some((cols) => rows().some((r) => cols.every((c) => r[c] === row[c])));
        if (clash) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
        rows().push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return chain;
  };
  return { from } as never;
}

const org = (id: string, over: Row = {}) => ({
  id,
  name: `Biz ${id}`,
  created_at: ago(2),
  onboarding_completed: false,
  trial_ends_at: new Date(Date.now() + DAY).toISOString(),
  setup_paid_at: null,
  is_demo: false,
  is_suspended: false,
  ...over,
});
const profile = (orgId: string, email: string) => ({ organization_id: orgId, owner_email: email, owner_name: "Sam Owner" });

let tables: Record<string, Row[]>;
beforeEach(() => {
  sendTemplateEmail.mockClear();
  tables = {
    organizations: [
      org("a"),
      org("b"), // same owner as "a", second workspace
      org("demo", { is_demo: true }),
      org("susp", { is_suspended: true }),
      org(PLATFORM_OWNER_ORG_ID),
      org("qa"),
      org("svcqa"),
      org("optout"),
    ],
    business_profiles: [
      profile("a", "Owner@Example.com"),
      profile("b", "owner@example.com"),
      profile("demo", "demo@example.com"),
      profile("susp", "susp@example.com"),
      profile(PLATFORM_OWNER_ORG_ID, "me@example.com"),
      profile("qa", "tester+qa@example.com"),
      profile("svcqa", "tester+svcqa1@example.com"),
      profile("optout", "gone@example.com"),
    ],
    lifecycle_email_optouts: [{ email: "gone@example.com", token: "t".repeat(48), opted_out_at: ago(1) }],
    appointments: [
      { organization_id: "a", id: "ap1", name: "Dana", starts_at: ago(-1), status: "pending", created_at: ago(0.5) },
      { organization_id: "a", id: "ap2", name: "Lee", starts_at: ago(-2), status: "pending", created_at: ago(0.2) },
    ],
  };
});

describe("lifecycle email planning", () => {
  it("recognises QA inboxes", () => {
    expect(isTestInbox("adam+qa@x.com")).toBe(true);
    expect(isTestInbox("adam+QA7@x.com")).toBe(true);
    expect(isTestInbox("adam+svcqa@x.com")).toBe(true);
    expect(isTestInbox("adam+quality@x.com")).toBe(false);
    expect(isTestInbox("adam@qa.com")).toBe(false);
  });

  it("emails each person once per email, and never demo, suspended, Revora-owned, QA or unsubscribed inboxes", async () => {
    const planned = await planLifecycleEmails(fakeDb(tables));
    expect(new Set(planned.map((p) => p.recipient))).toEqual(new Set(["owner@example.com"]));
    expect(planned.map((p) => p.kind).sort()).toEqual(["booking_followup", "setup_reminder", "welcome"]);
    expect(planned.every((p) => p.windowKey === "once")).toBe(true);
    expect(planned.find((p) => p.kind === "booking_followup")?.data["bookingName"]).toBe("Dana");
    expect(planned.find((p) => p.kind === "welcome")?.data["trialDays"]).toBe(3);
  });

  it("skips anyone who already got that email from any workspace, under any capitalisation", async () => {
    tables["lifecycle_email_log"] = [
      { organization_id: "zzz", kind: "welcome", window_key: "once", recipient: "Owner@Example.com" },
      { organization_id: "zzz", kind: "setup_reminder", window_key: "day-3-site", recipient: "owner@example.com" },
      { organization_id: "zzz", kind: "weekly_report", window_key: "w1", recipient: "owner@example.com" },
    ];
    const planned = await planLifecycleEmails(fakeDb(tables));
    expect(planned.map((p) => p.kind)).toEqual(["booking_followup"]);
  });

  it("fails closed when the send log can't be read", async () => {
    const db = fakeDb(tables) as { from: (t: string) => Record<string, unknown> };
    const broken = {
      from: (t: string) => {
        const chain = db.from(t);
        if (t !== "lifecycle_email_log") return chain;
        const failing: Record<string, unknown> = {
          select: () => failing,
          in: () => failing,
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: "boom" } }),
        };
        return failing;
      },
    };
    await expect(planLifecycleEmails(broken as never)).rejects.toThrow(/lifecycle_email_log/);
  });
});

describe("lifecycle email run", () => {
  it("sends with a personal unsubscribe link, logs each send, and a second run sends nothing", async () => {
    const db = fakeDb(tables);
    const first = await runLifecycleEmails(db);
    expect(first.sent).toBe(3);
    const optout = tables["lifecycle_email_optouts"]!.find((r) => r["email"] === "owner@example.com");
    expect(optout?.["token"]).toMatch(/^[a-f0-9]{48}$/);
    for (const call of sendTemplateEmail.mock.calls) {
      expect(call[1]).toBe("owner@example.com");
      const data = (call[2] as { templateData: Record<string, unknown> }).templateData;
      expect(data["unsubscribeUrl"]).toBe(`https://revoragrowthsystems.com/unsubscribe/lifecycle/${optout?.["token"]}`);
    }
    const second = await runLifecycleEmails(db);
    expect(second.sent).toBe(0);
    expect(sendTemplateEmail).toHaveBeenCalledTimes(3);
  });

  it("stops emailing an address once its unsubscribe link is used", async () => {
    const db = fakeDb(tables);
    await runLifecycleEmails(db, { max: 1 });
    const token = String(tables["lifecycle_email_optouts"]!.find((r) => r["email"] === "owner@example.com")?.["token"]);
    expect(await unsubscribeLifecycleByToken(db, token)).toBe(true);
    expect(await unsubscribeLifecycleByToken(db, "short")).toBe(false);
    expect(await unsubscribeLifecycleByToken(db, "x".repeat(48))).toBe(false);
    sendTemplateEmail.mockClear();
    const after = await runLifecycleEmails(db);
    expect(after.sent).toBe(0);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });
});
