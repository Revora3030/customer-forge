import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email-templates/send-email", () => ({ emailSendingConfigured: () => true, sendTemplateEmail: vi.fn(async () => ({ sent: true })) }));
// No AI in unit tests: the plain fallback draft is used.
vi.mock("@/lib/ai/router.server", () => ({
  generateText: vi.fn(async () => {
    throw new Error("no AI in tests");
  }),
}));

import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import {
  addDoNotContact,
  handleInboundSms,
  isDoNotContact,
  normalizePhone,
  parseInboundKeyword,
  sendDemoOutreach,
  smsAllowedNow,
  stripOutreachFooter,
  timeZoneForState,
  withStopLine,
} from "@/lib/prospect-outreach.server";
import { twilioSignature, validateTwilioSignature } from "@/lib/sms/twilio.server";
import { parseActions, splitReplyMeta, appendReplyMeta } from "@/lib/jarvis-actions";

type Row = Record<string, unknown>;

/** In-memory Supabase query builder that honours the filters this module uses. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const table = (name: string) => (tables[name] ??= []);
  const from = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    let head = false;
    let limit = Infinity;
    let order: { column: string; ascending: boolean } | null = null;
    const matches = () => {
      let rows = table(name).filter((row) => filters.every((f) => f(row)));
      if (order) {
        const { column, ascending } = order;
        rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
      }
      return rows.slice(0, limit);
    };
    const run = () => {
      const rows = matches();
      if (op === "update") rows.forEach((row) => Object.assign(row, patch));
      if (op === "delete") tables[name] = table(name).filter((row) => !rows.includes(row));
      return { data: head ? null : rows, count: rows.length, error: null };
    };
    const chain: Record<string, unknown> = {
      select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), chain),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), chain),
      gte: (column: string, value: string) => (filters.push((row) => String(row[column]) >= value), chain),
      order: (column: string, opts?: { ascending?: boolean }) => ((order = { column, ascending: opts?.ascending !== false }), chain),
      limit: (n: number) => ((limit = n), chain),
      update: (values: Row) => ((op = "update"), (patch = values), chain),
      delete: () => ((op = "delete"), chain),
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
      insert: async (row: Row) => {
        const full: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
        if (
          name === "prospect_outreach" &&
          full["status"] === "sent" &&
          full["mode"] === "autopilot" &&
          table(name).some((r) => r["organization_id"] === full["organization_id"] && r["channel"] === full["channel"] && r["status"] === "sent" && r["mode"] === "autopilot")
        )
          return { error: { code: "23505", message: "duplicate key" } };
        table(name).push(full);
        return { error: null };
      },
      upsert: async (row: Row, opts?: { ignoreDuplicates?: boolean }) => {
        const existing = table(name).find((r) => r["value"] === row["value"]);
        if (existing && !opts?.ignoreDuplicates) Object.assign(existing, row);
        if (!existing) table(name).push({ created_at: new Date().toISOString(), ...row });
        return { error: null };
      },
    };
    return chain;
  };
  return { db: { from } as never, tables };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

function demoSeed(extra: Record<string, Row[]> = {}) {
  return {
    website_settings: [
      {
        organization_id: ORG,
        generation: { prospectDemo: { kind: "prospect_demo", createdBy: "admin", createdAt: "2026-10-18T00:00:00Z", previewToken: "tok_abcdefghijklmnopqrst" } },
      },
    ],
    organizations: [{ id: ORG, name: "Triangle Comfort", industry: "HVAC" }],
    business_profiles: [{ organization_id: ORG, email: "owner@triangle.com", phone: "(919) 555-0100", city: "Raleigh", state: "NC" }],
    generation_jobs: [{ organization_id: ORG, status: "completed", progress: 100, current_step: null, error_message: null, created_at: "2026-10-18T01:00:00Z" }],
    ...extra,
  };
}

const ENV_KEYS = [
  "REVORA_MAILING_ADDRESS",
  "OUTREACH_DAILY_EMAIL_CAP",
  "OUTREACH_DAILY_SMS_CAP",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_MESSAGING_SERVICE_SID",
  "APP_URL",
];
const saved: Record<string, string | undefined> = {};
const twilioFetch = vi.fn(async () => new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }));

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env["REVORA_MAILING_ADDRESS"] = "123 Main St, Raleigh, NC 27601";
  process.env["TWILIO_ACCOUNT_SID"] = "AC123";
  process.env["TWILIO_AUTH_TOKEN"] = "secret";
  process.env["TWILIO_FROM_NUMBER"] = "+19195550000";
  vi.mocked(sendTemplateEmail).mockClear();
  twilioFetch.mockClear();
  vi.stubGlobal("fetch", twilioFetch);
  // 14:00 in Raleigh (EDT): inside the texting window.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const email = { organizationId: ORG, channel: "email" as const, to: "owner@triangle.com", mode: "manual" as const, actorId: "admin" };
const sms = { organizationId: ORG, channel: "sms" as const, to: "(919) 555-0100", mode: "manual" as const, actorId: "admin" };

describe("prospect outreach safeguards", () => {
  it("sends an email with the CAN-SPAM footer and a one-click unsubscribe link", async () => {
    const { db, tables } = fakeDb(demoSeed());
    const result = await sendDemoOutreach(db, email);
    expect(result.ok).toBe(true);
    const call = vi.mocked(sendTemplateEmail).mock.calls[0]!;
    expect(call[0]).toBe("prospect-demo");
    const options = call[2]!;
    expect(options.idempotencyKey).toBe(`prospect-demo-${ORG}-${result.ok ? result.outreachId : ""}`);
    const data = options.templateData as { footerLines: string[]; unsubscribeUrl: string; message: string };
    expect(data.footerLines).toContain("123 Main St, Raleigh, NC 27601");
    expect(data.unsubscribeUrl).toMatch(/^https:\/\/revoragrowthsystems\.com\/unsubscribe\/outreach\/[a-f0-9]{48}$/);
    expect(data.message).toContain("/p/tok_abcdefghijklmnopqrst");
    const row = tables["prospect_outreach"]![0]!;
    expect(row).toMatchObject({ status: "sent", channel: "email", recipient: "owner@triangle.com", mode: "manual" });
    expect(String(row["body"])).toContain("123 Main St, Raleigh, NC 27601");
    expect(String(row["body"])).toContain(data.unsubscribeUrl);
    expect(tables["prospect_outreach_unsubscribe_tokens"]![0]).toMatchObject({ value: "owner@triangle.com" });
  });

  it("keeps one footer when the reviewed body already has it, and always adds the unsubscribe link", async () => {
    const { outreachFooter } = await import("@/lib/jarvis-prospecting.functions");
    const { db, tables } = fakeDb(demoSeed());
    const body = `Hi team,\n\nYour draft: https://revoragrowthsystems.com/p/tok_abcdefghijklmnopqrst\n${outreachFooter().footer}`;
    expect((await sendDemoOutreach(db, { ...email, subject: "Re: A free website draft", body })).ok).toBe(true);
    const data = vi.mocked(sendTemplateEmail).mock.calls[0]![2]!.templateData as { subject: string; message: string; unsubscribeUrl: string };
    expect(data.subject).toBe("A free website draft");
    expect(data.message).not.toContain("123 Main St");
    expect(data.unsubscribeUrl).toContain("/unsubscribe/outreach/");
    const stored = String(tables["prospect_outreach"]![0]!["body"]);
    expect(stored.split("123 Main St").length - 1).toBe(1);
    expect(stored).toContain(data.unsubscribeUrl);
  });

  it("appends the STOP line to an operator-written text", async () => {
    const { db } = fakeDb(demoSeed());
    expect((await sendDemoOutreach(db, { ...sms, body: "Hi! Your free draft site: https://x.test/p/1" })).ok).toBe(true);
    const init = (twilioFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(String(init.body)).get("Body")).toBe("Hi! Your free draft site: https://x.test/p/1\nReply STOP to opt out.");
  });

  it("reports build stages and outreach history in the demo status", async () => {
    const { getDemoStatus } = await import("@/lib/prospect-outreach.server");
    const { db } = fakeDb(demoSeed());
    await sendDemoOutreach(db, email);
    const status = await getDemoStatus(db, ORG);
    expect(status).toMatchObject({ status: "completed", claimed: false, email: "owner@triangle.com", phone: "+19195550100" });
    expect(status?.previewUrl).toBe("https://revoragrowthsystems.com/p/tok_abcdefghijklmnopqrst");
    expect(status?.stages.every((stage) => stage.done)).toBe(true);
    expect(status?.outreach).toHaveLength(1);
  });

  it("renders the unsubscribe link and address in the email itself", async () => {
    const { render } = await import("@react-email/render");
    const React = await import("react");
    const { template } = await import("@/lib/email-templates/prospect-demo");
    const text = await render(
      React.createElement(template.component, {
        subject: "A free website draft",
        message: "Hi there",
        footerLines: ["Revora Growth Systems", "123 Main St"],
        unsubscribeUrl: "https://revoragrowthsystems.com/unsubscribe/outreach/abc",
      }),
      { plainText: true },
    );
    expect(text).toContain("123 Main St");
    expect(text).toContain("https://revoragrowthsystems.com/unsubscribe/outreach/abc");
  });

  it("never emails without a physical mailing address", async () => {
    delete process.env["REVORA_MAILING_ADDRESS"];
    const { db } = fakeDb(demoSeed());
    const result = await sendDemoOutreach(db, email);
    expect(result).toMatchObject({ ok: false, reason: "mailing_address_missing" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("blocks email and text to anyone on the do-not-contact list", async () => {
    const { db, tables } = fakeDb(demoSeed());
    await addDoNotContact(db, "Owner@Triangle.com", "unsubscribe_link");
    await addDoNotContact(db, "919-555-0100", "sms_stop");
    expect(await isDoNotContact(db, "owner@triangle.com")).toBe(true);
    expect(await sendDemoOutreach(db, email)).toMatchObject({ ok: false, reason: "do_not_contact" });
    expect(await sendDemoOutreach(db, sms)).toMatchObject({ ok: false, reason: "do_not_contact" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
    expect(twilioFetch).not.toHaveBeenCalled();
    expect(tables["prospect_outreach"]!.map((row) => row["status"])).toEqual(["skipped", "skipped"]);
  });

  it("stops at the daily cap for the channel", async () => {
    process.env["OUTREACH_DAILY_EMAIL_CAP"] = "1";
    const { db } = fakeDb(
      demoSeed({
        prospect_outreach: [{ id: "x", organization_id: OTHER_ORG, channel: "email", recipient: "a@b.com", status: "sent", mode: "manual", created_at: "2026-10-19T10:00:00.000Z" }],
      }),
    );
    expect(await sendDemoOutreach(db, email)).toMatchObject({ ok: false, reason: "daily_cap" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("sends once per demo per channel unless the operator explicitly resends", async () => {
    const { db } = fakeDb(demoSeed());
    expect((await sendDemoOutreach(db, email)).ok).toBe(true);
    expect(await sendDemoOutreach(db, email)).toMatchObject({ ok: false, reason: "already_sent" });
    expect((await sendDemoOutreach(db, { ...email, force: true })).ok).toBe(true);
    expect(await sendDemoOutreach(db, { ...email, mode: "autopilot", force: true })).toMatchObject({ ok: false, reason: "already_sent" });
    expect(sendTemplateEmail).toHaveBeenCalledTimes(2);
  });

  it("only texts inside 9am-8pm in the business's time zone", async () => {
    expect(timeZoneForState("NC")).toBe("America/New_York");
    expect(timeZoneForState("California")).toBe("America/Los_Angeles");
    expect(timeZoneForState(null)).toBe("America/New_York");
    const now = new Date("2026-10-19T14:00:00Z"); // 10:00 New York, 07:00 Los Angeles
    expect(smsAllowedNow(now, "NY")).toBe(true);
    expect(smsAllowedNow(now, "CA")).toBe(false);
    expect(smsAllowedNow(new Date("2026-10-20T00:30:00Z"), "NC")).toBe(false); // 20:30 EDT

    vi.setSystemTime(new Date("2026-10-19T07:00:00Z")); // 03:00 in Raleigh
    const { db } = fakeDb(demoSeed());
    expect(await sendDemoOutreach(db, sms)).toMatchObject({ ok: false, reason: "quiet_hours" });
    expect(twilioFetch).not.toHaveBeenCalled();
  });

  it("never cold-texts from the autopilot: SMS needs recorded consent", async () => {
    const { db } = fakeDb(demoSeed());
    expect(await sendDemoOutreach(db, { ...sms, mode: "autopilot", actorId: null })).toMatchObject({ ok: false, reason: "no_consent" });
    expect(twilioFetch).not.toHaveBeenCalled();

    const consented = fakeDb(demoSeed({ prospect_contact_consent: [{ value: "+19195550100", sms: true, email: false }] }));
    expect((await sendDemoOutreach(consented.db, { ...sms, mode: "autopilot", actorId: null })).ok).toBe(true);
    expect(twilioFetch).toHaveBeenCalledTimes(1);
  });

  it("sends a manual text through Twilio ending with the STOP line", async () => {
    const { db, tables } = fakeDb(demoSeed());
    expect((await sendDemoOutreach(db, sms)).ok).toBe(true);
    const [url, init] = twilioFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("To")).toBe("+19195550100");
    expect(form.get("Body")).toMatch(/Reply STOP to opt out\.$/);
    expect(tables["prospect_outreach"]![0]).toMatchObject({ status: "sent", provider_id: "SM123" });
  });

  it("explains which secrets to add when texting isn't configured", async () => {
    delete process.env["TWILIO_FROM_NUMBER"];
    const { db } = fakeDb(demoSeed());
    const result = await sendDemoOutreach(db, sms);
    expect(result).toMatchObject({ ok: false, reason: "sms_not_configured" });
    expect(result.ok ? "" : result.message).toContain("TWILIO_FROM_NUMBER");
  });

  it("adds STOP repliers to do-not-contact and records START consent", async () => {
    expect(parseInboundKeyword(" stop ")).toBe("stop");
    expect(parseInboundKeyword("Unsubscribe")).toBe("stop");
    expect(parseInboundKeyword("START")).toBe("start");
    expect(parseInboundKeyword("stop texting me about other things")).toBeNull();

    const { db, tables } = fakeDb(demoSeed());
    expect(await handleInboundSms(db, "+19195550100", "STOP")).toBe("stop");
    expect(await isDoNotContact(db, "(919) 555-0100")).toBe(true);
    expect(await sendDemoOutreach(db, sms)).toMatchObject({ ok: false, reason: "do_not_contact" });

    expect(await handleInboundSms(db, "+19195550100", "yes")).toBe("start");
    expect(await isDoNotContact(db, "+19195550100")).toBe(false);
    expect(tables["prospect_contact_consent"]![0]).toMatchObject({ value: "+19195550100", sms: true });
  });

  it("keeps text formatting helpers honest", () => {
    expect(normalizePhone("(919) 555-0100")).toBe("+19195550100");
    expect(normalizePhone("call me")).toBeNull();
    expect(withStopLine("Hi\nReply STOP to opt out.")).toBe("Hi\nReply STOP to opt out.");
    expect(stripOutreachFooter("Hello\n\n--\nSam\nRevora Growth Systems\n123 Main")).toBe("Hello");
  });
});

describe("Twilio webhook signature", () => {
  const params = { From: "+19195550100", Body: "STOP", To: "+19195550000", MessageSid: "SM1" };
  const url = "https://revoragrowthsystems.com/api/public/twilio/inbound";
  const reference = (token: string) =>
    createHmac("sha1", token)
      .update(url + Object.keys(params).sort().map((key) => key + params[key as keyof typeof params]).join(""))
      .digest("base64");

  it("matches Twilio's HMAC-SHA1 scheme and rejects tampering", async () => {
    expect(await twilioSignature("secret", url, params)).toBe(reference("secret"));
    expect(await validateTwilioSignature("secret", url, params, reference("secret"))).toBe(true);
    expect(await validateTwilioSignature("secret", url, { ...params, Body: "START" }, reference("secret"))).toBe(false);
    expect(await validateTwilioSignature("secret", url, params, reference("other"))).toBe(false);
    expect(await validateTwilioSignature("secret", url, params, null)).toBe(false);
  });
});

describe("Jarvis demo outreach actions", () => {
  it("reads demo.status and turns demo.send into an approval proposal", () => {
    const parsed = parseActions(
      [
        { id: "demo.status", args: { name: "Triangle Comfort" } },
        { id: "demo.send", args: { organizationId: ORG, channel: "sms" } },
        { id: "demo.send", args: { organizationId: "nope", channel: "email" } },
      ],
      [],
    );
    expect(parsed.reads).toEqual([{ id: "demo.status", organizationId: null, name: "Triangle Comfort" }]);
    expect(parsed.proposals).toEqual([{ id: "demo.send", organizationId: ORG, channel: "sms", to: null }]);
    expect(parsed.rejected[0]).toMatch(/demo.send/);
    const { meta } = splitReplyMeta(appendReplyMeta("Ready.", { ran: [], proposals: parsed.proposals }));
    expect(meta.proposals).toEqual(parsed.proposals);
  });
});
