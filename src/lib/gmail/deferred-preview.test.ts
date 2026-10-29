import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gmail/outreach.server", () => ({
  sendGmailOutreach: vi.fn(async () => ({ ok: true, id: "g-1", threadId: "thread0001", rfcMessageId: "<reply@revora.test>" })),
}));
vi.mock("@/lib/demo-launch-gate.server", () => ({
  assessDemoForOutreach: vi.fn(async () => ({ ok: true, blockers: [] })),
}));

import { sendGmailOutreach } from "@/lib/gmail/outreach.server";
import { gmailConfig } from "@/lib/gmail/client.server";
import { mergedMailingAddress, withStoredGmail } from "@/lib/gmail/stored-config.server";
import { deliverDeferredPitchPreviews } from "@/lib/prospect-replies.server";

type Row = Record<string, unknown>;

function database(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const db = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const predicates: Array<(row: Row) => boolean> = [];
      let mode: "select" | "update" | "insert" = "select";
      let value: Row = {};
      let limit = Infinity;
      const run = () => {
        if (mode === "insert") {
          const row = { id: `${table}-${rows.length + 1}`, ...value };
          rows.push(row);
          return { data: [{ ...row }], error: null };
        }
        const selected = rows.filter((row) => predicates.every((predicate) => predicate(row))).slice(0, limit);
        if (mode === "update") selected.forEach((row) => Object.assign(row, value));
        return { data: selected.map((row) => ({ ...row })), error: null, count: selected.length };
      };
      const query = {
        select: () => query,
        insert: (next: Row) => { mode = "insert"; value = next; return query; },
        update: (next: Row) => { mode = "update"; value = next; return query; },
        eq: (key: string, expected: unknown) => { predicates.push((row) => row[key] === expected); return query; },
        in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
        order: () => query,
        limit: (count: number) => { limit = count; return query; },
        maybeSingle: async () => ({ ...run(), data: run().data[0] ?? null }),
        then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
  return { db: db as never, tables };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const TOKEN = "tok_abcdefghijklmnopqrst";

function seed(jobStatus: string) {
  return database({
    prospect_inbound: [{
      id: "22222222-2222-4222-8222-222222222222",
      organization_id: ORG,
      thread_id: "thread0001",
      gmail_message_id: "m1",
      rfc_message_id: "<owner@shop.test>",
      references_ids: [],
      from_address: "owner@shop.test",
      subject: "Re: a website for your shop",
      body: "Yes, send it over",
      received_at: "2026-10-28T12:00:00.000Z",
      intent: "positive",
      status: "awaiting_operator",
      draft_reason: "demo_unavailable",
      action: "drafted",
    }],
    website_settings: [{
      organization_id: ORG,
      generation: { prospectDemo: { kind: "prospect_demo", createdBy: "admin", createdAt: "2026-10-28T00:00:00.000Z", previewToken: TOKEN, pitchFirst: false, pitchAnsweredAt: "2026-10-28T12:00:01.000Z" } },
    }],
    organizations: [{ id: ORG, name: "Shine Mobile" }],
    business_profiles: [{ organization_id: ORG, email: "owner@shop.test", phone: null, city: "Raleigh", state: "NC" }],
    generation_jobs: [{ organization_id: ORG, status: jobStatus, progress: jobStatus === "completed" ? 100 : 10, current_step: null, error_message: null, steps: [], created_at: "2026-10-28T12:00:02.000Z" }],
    prospect_autopilot_settings: [{ id: 1, gmail: { clientId: "client-id-value", clientSecret: "client-secret-value", refreshToken: "refresh-token-value", senderEmail: "sam@revora.test", mailingAddress: "1 Main Street, Raleigh NC 27601" } }],
  });
}

const ENV = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL", "REVORA_MAILING_ADDRESS"] as const;

afterEach(() => {
  for (const key of ENV) delete process.env[key];
  vi.clearAllMocks();
});

describe("deferred pitch preview delivery", () => {
  it("sends the finished preview in the same thread and closes the inbound row", async () => {
    const { db, tables } = seed("completed");
    const sent = await deliverDeferredPitchPreviews(db);
    expect(sent).toBe(1);
    expect(sendGmailOutreach).toHaveBeenCalledTimes(1);
    const message = vi.mocked(sendGmailOutreach).mock.calls[0]?.[1];
    expect(message?.threadId).toBe("thread0001");
    expect(message?.inReplyTo).toBe("<owner@shop.test>");
    expect(message?.text).toContain(`/p/${TOKEN}`);
    expect(message?.text).toContain("$350");
    expect(tables["prospect_inbound"]?.[0]).toMatchObject({ status: "auto_replied", action: "auto_replied", draft_reason: "deferred_demo_delivered" });
    expect(tables["prospect_outreach"]?.some((row) => row["reason"] === "deferred_demo_delivered" && row["kind"] === "reply" && row["status"] === "sent")).toBe(true);
  });

  it("waits while the deferred build is still queued", async () => {
    const { db, tables } = seed("queued");
    expect(await deliverDeferredPitchPreviews(db)).toBe(0);
    expect(sendGmailOutreach).not.toHaveBeenCalled();
    expect(tables["prospect_inbound"]?.[0]?.["status"]).toBe("awaiting_operator");
  });
});

describe("saved Gmail settings", () => {
  it("fills gmailConfig from the database only while that read is active", async () => {
    const { db } = seed("completed");
    expect(gmailConfig()).toBeNull();
    await withStoredGmail(db, () => {
      expect(gmailConfig()).toMatchObject({ sender: "sam@revora.test", clientId: "client-id-value" });
      expect(mergedMailingAddress()).toBe("1 Main Street, Raleigh NC 27601");
    });
    expect(gmailConfig()).toBeNull();
  });

  it("keeps an environment variable ahead of the saved value", async () => {
    process.env["GMAIL_CLIENT_ID"] = "env-client-id";
    process.env["GMAIL_CLIENT_SECRET"] = "env-client-secret";
    process.env["GMAIL_REFRESH_TOKEN"] = "env-refresh-token";
    process.env["GMAIL_SENDER_EMAIL"] = "env@revora.test";
    const { db } = seed("completed");
    await withStoredGmail(db, () => {
      expect(gmailConfig()?.sender).toBe("env@revora.test");
      expect(gmailConfig()?.clientId).toBe("env-client-id");
    });
  });
});
