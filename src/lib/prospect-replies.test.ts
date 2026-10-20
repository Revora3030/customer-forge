import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

vi.mock("@/lib/email-templates/send-email", () => ({ emailSendingConfigured: () => true, sendTemplateEmail: vi.fn(async () => ({ sent: true })) }));

/** The free-pool answers each prompt gets in these tests; no provider is ever called. */
const ai = {
  intent: '{"intent":"positive","confidence":0.9}' as string | Error,
  reply: '{"body":"Great to hear! Your draft is here: https://revoragrowthsystems.com/p/tok_abcdefghijklmnopqrst"}' as string | Error,
  review: '{"pass":true,"problems":[]}' as string | Error,
};
vi.mock("@/lib/ai/router.server", () => ({
  generateText: vi.fn(async (_caller: unknown, request: { messages: Array<{ role: string; content: string }> }) => {
    const system = request.messages[0]?.content ?? "";
    const pick = system.includes("You classify") ? ai.intent : system.includes("strict fact checker") ? ai.review : system.includes("short, friendly reply") ? ai.reply : new Error("no AI in tests");
    if (pick instanceof Error) throw pick;
    return { text: pick };
  }),
}));

import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { generateText } from "@/lib/ai/router.server";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import { resetGmailTokenCache, setGmailSleepForTests, GMAIL_SECRETS } from "@/lib/gmail/client.server";
import { base64UrlDecode, base64UrlEncode, buildMimeMessage, buildRawMessage, parseGmailMessage, stripQuotedReply } from "@/lib/gmail/mime.server";
import { isDoNotContact, sendDemoOutreach, setOutreachGateForTests, DEFAULT_DAILY_EMAIL_CAP, dailyCap } from "@/lib/prospect-outreach.server";
import {
  autoReplyDecision,
  buildFactsSheet,
  factCheckReply,
  fallbackDraft,
  keywordIntent,
  parseReviewVerdict,
  replySubject,
  resolveIntent,
  riskFlags,
} from "@/lib/prospect-replies";
import { runProspectReplies, approveReplyDraft, listProspectInbox } from "@/lib/prospect-replies.server";
import { claimQueuedOutreach, drainSendQueue, enqueueOutreach, MAX_QUEUE_ATTEMPTS } from "@/lib/prospect-send-queue.server";
import { parseActions } from "@/lib/jarvis-actions";

type Row = Record<string, unknown>;

/** In-memory Supabase stand-in covering the filters, returning updates, unique keys and the queue claim RPC. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const table = (name: string) => (tables[name] ??= []);
  const uniqueViolation = (name: string, row: Row) => {
    const rows = table(name);
    if (name === "prospect_inbound") return rows.some((r) => r["gmail_message_id"] === row["gmail_message_id"]);
    if (name === "prospect_send_queue")
      return row["status"] === "queued" && rows.some((r) => r["status"] === "queued" && r["organization_id"] === row["organization_id"] && r["channel"] === row["channel"]);
    if (name === "prospect_outreach")
      return (
        row["status"] === "sent" &&
        row["mode"] === "autopilot" &&
        (row["kind"] ?? "first_touch") === "first_touch" &&
        rows.some((r) => r["organization_id"] === row["organization_id"] && r["channel"] === row["channel"] && r["status"] === "sent" && r["mode"] === "autopilot" && (r["kind"] ?? "first_touch") === "first_touch")
      );
    return false;
  };
  const from = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    let head = false;
    let returning = false;
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
      if (op === "update") return { data: returning ? rows.map((r) => ({ ...r })) : null, error: null };
      return { data: head ? null : rows.map((r) => ({ ...r })), count: rows.length, error: null };
    };
    const chain: Record<string, unknown> = {
      select: (_cols?: string, opts?: { head?: boolean }) => (op === "update" ? (returning = true) : (head = Boolean(opts?.head)), chain),
      eq: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? (column === "kind" ? "first_touch" : undefined)) === value), chain),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), chain),
      gte: (column: string, value: string) => (filters.push((row) => String(row[column]) >= value), chain),
      lt: (column: string, value: string) => (filters.push((row) => row[column] != null && String(row[column]) < value), chain),
      not: (column: string, _op: string, _value: null) => (filters.push((row) => row[column] != null), chain),
      is: (column: string, _value: null) => (filters.push((row) => row[column] == null), chain),
      order: (column: string, opts?: { ascending?: boolean }) => ((order = { column, ascending: opts?.ascending !== false }), chain),
      limit: (n: number) => ((limit = n), chain),
      update: (values: Row) => ((op = "update"), (patch = values), chain),
      delete: () => ((op = "delete"), chain),
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
      insert: async (row: Row) => {
        const full: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
        if (uniqueViolation(name, full)) return { error: { code: "23505", message: "duplicate key" } };
        table(name).push(full);
        return { error: null };
      },
      upsert: async (row: Row, opts?: { ignoreDuplicates?: boolean }) => {
        const key = "value" in row ? "value" : "id";
        const existing = table(name).find((r) => r[key] === row[key]);
        if (existing && !opts?.ignoreDuplicates) Object.assign(existing, row);
        if (!existing) table(name).push({ created_at: new Date().toISOString(), ...row });
        return { error: null };
      },
    };
    return chain;
  };
  /** Same semantics as claim_prospect_send_queue in the migration. */
  const rpc = async (fn: string, args: { p_owner: string; p_limit: number; p_lease_seconds: number }) => {
    if (fn !== "claim_prospect_send_queue") return { data: null, error: { message: "unknown function" } };
    const now = new Date().toISOString();
    const due = table("prospect_send_queue")
      .filter((r) => r["status"] === "queued" && String(r["not_before"]) <= now && (r["leased_until"] == null || String(r["leased_until"]) < now))
      .sort((a, b) => (String(a["not_before"]) < String(b["not_before"]) ? -1 : 1))
      .slice(0, args.p_limit);
    for (const row of due) {
      row["leased_until"] = new Date(Date.now() + args.p_lease_seconds * 1000).toISOString();
      row["lease_owner"] = args.p_owner;
      row["attempts"] = Number(row["attempts"] ?? 0) + 1;
    }
    return { data: due.map((r) => ({ ...r })), error: null };
  };
  return { db: { from, rpc } as never, tables };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG2 = "33333333-3333-4333-8333-333333333333";
const PREVIEW = "https://revoragrowthsystems.com/p/tok_abcdefghijklmnopqrst";
const CLAIM = "https://revoragrowthsystems.com/get-started?claim=tok_abcdefghijklmnopqrst";

function demoSeed(extra: Record<string, Row[]> = {}) {
  return {
    website_settings: [
      { organization_id: ORG, generation: { prospectDemo: { kind: "prospect_demo", createdBy: "admin", createdAt: "2026-10-18T00:00:00Z", previewToken: "tok_abcdefghijklmnopqrst" } } },
      { organization_id: ORG2, generation: { prospectDemo: { kind: "prospect_demo", createdBy: "admin", createdAt: "2026-10-18T00:00:00Z", previewToken: "tok_zyxwvutsrqponmlkjihg" } } },
    ],
    organizations: [
      { id: ORG, name: "Triangle Comfort", industry: "HVAC" },
      { id: ORG2, name: "Bull City Roofing", industry: "Roofing" },
    ],
    business_profiles: [
      { organization_id: ORG, email: "owner@triangle.com", phone: "(919) 555-0100", city: "Raleigh", state: "NC" },
      { organization_id: ORG2, email: "hi@bullcity.com", phone: null, city: "Durham", state: "NC" },
    ],
    generation_jobs: [
      { organization_id: ORG, status: "completed", progress: 100, current_step: null, error_message: null, created_at: "2026-10-18T01:00:00Z" },
      { organization_id: ORG2, status: "completed", progress: 100, current_step: null, error_message: null, created_at: "2026-10-18T01:00:00Z" },
    ],
    ...extra,
  };
}

/** A sent first-touch email whose Gmail thread is THREAD. */
const THREAD = "thread0001";
const sentOutreach = (overrides: Row = {}): Row => ({
  id: "44444444-4444-4444-8444-444444444444",
  organization_id: ORG,
  channel: "email",
  recipient: "owner@triangle.com",
  subject: "A free website draft for Triangle Comfort",
  status: "sent",
  mode: "autopilot",
  kind: "first_touch",
  gmail_thread_id: THREAD,
  gmail_id: "out1",
  rfc_message_id: "<revora.first@revora.test>",
  created_at: "2026-10-19T10:00:00.000Z",
  ...overrides,
});

const ENV_KEYS = [...GMAIL_SECRETS, "REVORA_MAILING_ADDRESS", "OUTREACH_DAILY_EMAIL_CAP", "APP_URL", "REVORA_SENDER_NAME", "REVORA_REPLY_TO_EMAIL"];
const saved: Record<string, string | undefined> = {};

function setGmail() {
  process.env["GMAIL_CLIENT_ID"] = "client";
  process.env["GMAIL_CLIENT_SECRET"] = "secret";
  process.env["GMAIL_REFRESH_TOKEN"] = "refresh-token-value";
  process.env["GMAIL_SENDER_EMAIL"] = "sam@revora.test";
}

/** Inbound Gmail message payload; `below` is text typed under the quoted history. */
function inbound(id: string, text: string, opts: { from?: string; subject?: string; at?: string; headers?: Array<{ name: string; value: string }>; below?: string } = {}) {
  return {
    id,
    threadId: THREAD,
    internalDate: String(Date.parse(opts.at ?? "2026-10-19T17:00:00Z")),
    snippet: text.slice(0, 80),
    labelIds: ["INBOX"],
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: opts.from ?? "Owner <owner@triangle.com>" },
        { name: "Subject", value: opts.subject ?? "Re: A free website draft for Triangle Comfort" },
        { name: "Message-ID", value: `<${id}@mail.test>` },
        { name: "References", value: "<revora.first@revora.test>" },
        ...(opts.headers ?? []),
      ],
      body: { data: base64UrlEncode(`${text}\n\nOn Mon, Oct 19, 2026 Sam wrote:\n> old text${opts.below ? `\n\n${opts.below}` : ""}`) },
    },
  };
}

let threadMessages: unknown[] = [];
let sendStatus = 200;
const sends: Array<{ raw: string; threadId?: string }> = [];
const gmailFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
  if (url.endsWith("/messages/send")) {
    if (sendStatus !== 200) return new Response("{}", { status: sendStatus });
    const body = JSON.parse(String(init?.body)) as { raw: string; threadId?: string };
    sends.push(body);
    return new Response(JSON.stringify({ id: `sent${sends.length}`, threadId: body.threadId ?? `newthread${sends.length}` }), { status: 200 });
  }
  if (url.includes("/threads/")) return new Response(JSON.stringify({ id: THREAD, messages: threadMessages }), { status: 200 });
  return new Response("not found", { status: 404 });
});

const sentText = (index = 0) => {
  const mime = base64UrlDecode(sends[index]!.raw);
  const [head, body] = mime.split("\r\n\r\n");
  return { head: head!, text: Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8") };
};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env["REVORA_MAILING_ADDRESS"] = "123 Main St, Raleigh, NC 27601";
  resetGmailTokenCache();
  setGmailSleepForTests(async () => undefined);
  setOutreachGateForTests(null);
  threadMessages = [];
  sendStatus = 200;
  sends.length = 0;
  gmailFetch.mockClear();
  vi.mocked(sendTemplateEmail).mockClear();
  vi.mocked(generateText).mockClear();
  ai.intent = '{"intent":"positive","confidence":0.9}';
  ai.reply = `{"body":"Great to hear! Your draft is here: ${PREVIEW}"}`;
  ai.review = '{"pass":true,"problems":[]}';
  vi.stubGlobal("fetch", gmailFetch);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  setGmailSleepForTests(null);
  setOutreachGateForTests(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Gmail MIME building", () => {
  it("builds RFC 5322 headers with one-click unsubscribe, threading and a base64url raw", () => {
    const message = {
      from: "sam@revora.test",
      fromName: "Sam (Revora Growth Systems)",
      to: "owner@triangle.com",
      subject: "Re: Your draft — café",
      text: "Hello\nLine two",
      messageId: "<revora.1@revora.test>",
      listUnsubscribeUrl: "https://revoragrowthsystems.com/unsubscribe/outreach/abc",
      inReplyTo: "<in1@mail.test>",
      references: ["<revora.first@revora.test>"],
      date: new Date("2026-10-19T18:00:00Z"),
    };
    const mime = buildMimeMessage(message);
    const [head, body] = mime.split("\r\n\r\n");
    expect(head).toContain('From: "Sam (Revora Growth Systems)" <sam@revora.test>');
    expect(head).toContain("To: owner@triangle.com");
    expect(head).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(head).toContain("Message-ID: <revora.1@revora.test>");
    expect(head).toContain("In-Reply-To: <in1@mail.test>");
    expect(head).toContain("References: <revora.first@revora.test> <in1@mail.test>");
    expect(head).toContain("List-Unsubscribe: <https://revoragrowthsystems.com/unsubscribe/outreach/abc>");
    expect(head).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Hello\r\nLine two");

    const raw = buildRawMessage(message);
    expect(raw).not.toMatch(/[+/=]/);
    expect(base64UrlDecode(raw)).toBe(mime);
  });

  it("never lets a subject or name inject headers", () => {
    const mime = buildMimeMessage({ from: "sam@revora.test", fromName: "Sam\r\nBcc: x@evil.test", to: "a@b.com", subject: "Hi\r\nBcc: victim@evil.test", text: "x", messageId: "<m@r.test>" });
    expect(mime.split("\r\n\r\n")[0]!.split("\r\n").some((line) => line.startsWith("Bcc:"))).toBe(false);
  });

  it("reads an inbound payload and drops the quoted history", () => {
    const parsed = parseGmailMessage(inbound("in1", "Yes please, how do I claim it?"));
    expect(parsed).toMatchObject({ id: "in1", threadId: THREAD, from: "owner@triangle.com", messageId: "<in1@mail.test>", text: "Yes please, how do I claim it?" });
    expect(parsed?.references).toEqual(["<revora.first@revora.test>"]);
    expect(stripQuotedReply("Sounds good\n> quoted\nOn Tue, Oct 20, 2026 at 9:00 AM Sam <s@x.com> wrote:\nold")).toBe("Sounds good");
    expect(parseGmailMessage(inbound("in2", "Out of office", { headers: [{ name: "Auto-Submitted", value: "auto-replied" }] }))?.autoSubmitted).toBe(true);
    expect(replySubject("RE: Re: A free draft")).toBe("Re: A free draft");
  });

  it("keeps text typed below or between quoted lines, but never unmarked history", () => {
    const header = "On Mon, Oct 19, 2026 at 9:00 AM Sam <sam@revora.test> wrote:";
    expect(stripQuotedReply(`${header}\n> Here's your free draft.\n> Unsubscribe: https://x.test/u\n\nRemove us from your list please`)).toBe("Remove us from your list please");
    expect(stripQuotedReply(`Thanks.\n\n${header}\n>\n> Want it?\nYes please\n> It's $350 setup.\nWhat's included?`)).toBe("Thanks.\n\nYes please\nWhat's included?");
    // HTML-only mail loses the "> " marks: our own footer below the header must not become the prospect's text.
    expect(stripQuotedReply(`Sounds good\n\n${header}\nHere's your free draft.\nUnsubscribe: https://x.test/u`)).toBe("Sounds good");
    expect(stripQuotedReply("Sure\n-----Original Message-----\nFrom: Sam\nUnsubscribe: https://x.test/u")).toBe("Sure");
    expect(parseGmailMessage(inbound("in3", "", { below: "Please take us off your list" }))?.text).toBe("Please take us off your list");
  });
});

describe("intent and guardrails", () => {
  it("overrides any AI answer with stop for stop/unsubscribe/remove-me wording", () => {
    for (const text of ["STOP", "Please remove me from your list", "unsubscribe", "Take me off this", "don't email me again", "opt-out"]) {
      expect(keywordIntent(text)).toBe("stop");
      expect(resolveIntent(text, "", { intent: "positive", confidence: 0.99 })).toEqual({ intent: "stop", confidence: 1, source: "keyword" });
    }
    expect(keywordIntent("Yes, how much is it?")).toBeNull();
    expect(resolveIntent("maybe", "", { intent: "positive", confidence: 0.3 }).intent).toBe("unclear");
    expect(resolveIntent("hm", "", null)).toMatchObject({ intent: "unclear", source: "fallback" });
    expect(riskFlags("I'll have my lawyer contact you")).toContain("legal");
    expect(riskFlags("WHY ARE YOU EMAILING ME ABOUT THIS NONSENSE")).toContain("anger");
  });

  it("matches curly apostrophes and the remove-us / take-us-off family, without matching \"don't stop\" or \"off-site\"", () => {
    const stops = [
      "don’t email me again",
      "Don’t contact us",
      "Please remove us from your list",
      "Can you take us off your list?",
      "take us off",
      "Unsubscribe us please",
      "I already unsubscribed",
      "Please opt us out",
      "Not interested, stop.",
      "Do not contact us again",
      "Leave us alone",
    ];
    for (const text of stops) {
      expect(keywordIntent(text), text).toBe("stop");
      // With the AI down the override still holds.
      expect(resolveIntent(text, "", null), text).toMatchObject({ intent: "stop", source: "keyword" });
    }
    const notStops = ["Don't stop, this looks great!", "Please don’t stop working on it", "Can you take us off-site?", "Take us offline for now", "Please remove the menu link", "Remove user reviews"];
    for (const text of notStops) expect(keywordIntent(text), text).toBeNull();
  });

  it("auto-replies only to positive/price/question, at most twice per thread", () => {
    const base = { flags: [], priorAutoReplies: 0, demoAvailable: true };
    expect(autoReplyDecision({ ...base, intent: "positive" })).toEqual({ auto: true });
    expect(autoReplyDecision({ ...base, intent: "price" })).toEqual({ auto: true });
    expect(autoReplyDecision({ ...base, intent: "objection" })).toMatchObject({ auto: false });
    expect(autoReplyDecision({ ...base, intent: "unclear" })).toMatchObject({ auto: false });
    expect(autoReplyDecision({ ...base, intent: "stop" })).toMatchObject({ auto: false, reason: "stop" });
    expect(autoReplyDecision({ ...base, intent: "question", priorAutoReplies: 2 })).toMatchObject({ auto: false, reason: "auto_reply_limit" });
    expect(autoReplyDecision({ ...base, intent: "positive", flags: ["legal"] })).toMatchObject({ auto: false, reason: "legal_threat" });
    expect(autoReplyDecision({ ...base, intent: "positive", flags: ["anger"] })).toMatchObject({ auto: false, reason: "anger" });
  });

  it("fact-checks replies against the facts sheet only", () => {
    const facts = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: CLAIM, senderEmail: "sam@revora.test" });
    expect(facts.setupPrice).toBe("$350 one-time setup");
    expect(facts.monthlyPrice).toBe("$100/month");
    expect(factCheckReply(`It's $350 setup and $100/month. Claim it: ${CLAIM}.`, facts)).toEqual([]);
    expect(factCheckReply("It's only $299 this week!", facts).join()).toMatch(/price not in the facts sheet/);
    expect(factCheckReply("See https://evil.test/x", facts).join()).toMatch(/link not in the facts sheet/);
    expect(factCheckReply("Call me at (919) 555-0100", facts).join()).toMatch(/phone/);
    expect(factCheckReply("We guarantee 30% more leads", facts).length).toBeGreaterThanOrEqual(2);
    expect(factCheckReply("Your site is live now", facts).join()).toMatch(/live or published/);
    expect(parseReviewVerdict('{"pass":true,"problems":["mentions a discount"]}')).toEqual({ pass: false, problems: ["mentions a discount"] });
    expect(parseReviewVerdict("no json")).toBeNull();
  });

  it("flags bare domains, unseparated phone numbers and other price forms, but passes the facts sheet", () => {
    const facts = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: CLAIM, senderName: "Sam", senderEmail: "sam.smith@revora.test" });
    const flagged = (body: string, pattern: RegExp) => expect(factCheckReply(body, facts).join("; "), body).toMatch(pattern);
    flagged("Book a call: calendly.com/sam", /bare web address not in the facts sheet: calendly\.com\/sam/);
    flagged("More at Example.co.", /bare web address not in the facts sheet: Example\.co$/);
    flagged("See www.evil.test", /bare web address/);
    flagged("Call (555)123-4567", /phone/);
    flagged("Call 5551234567", /phone/);
    flagged("Text +15551234567", /phone/);
    flagged("Only 500$ today", /price not in the facts sheet: 500\$/);
    flagged("Just USD 500", /price written in words/);
    flagged("It's €500", /currency/);
    flagged("About £", /currency/);

    // Everything the facts sheet holds still passes, including its links without the scheme.
    for (const body of [
      fallbackDraft("price", facts),
      fallbackDraft("positive", facts),
      `${facts.plan} is $350 setup (350$ once) and $100/month. Draft: ${PREVIEW.replace("https://", "")} and claim: ${CLAIM.replace("https://", "")}.`,
      `Hi, it's Sam from ${facts.company}. Write me at sam.smith@revora.test, e.g. on 2026-10-19 at 10:00 a.m. Thanks.`,
    ])
      expect(factCheckReply(body, facts), body).toEqual([]);
    // A long reference number is not a phone number.
    expect(factCheckReply("Your reference is 123456789012.", facts)).toEqual([]);
  });
});

describe("reply polling and follow-up", () => {
  it("returns gmail_not_configured cleanly and names the four secrets", async () => {
    const { db } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    const result = await runProspectReplies(db);
    expect(result.status).toBe("gmail_not_configured");
    expect(result.missingSecrets).toEqual(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL"]);
    expect(result.message).toContain("GMAIL_REFRESH_TOKEN");
    expect(gmailFetch).not.toHaveBeenCalled();
    const inbox = await listProspectInbox(db);
    expect(inbox).toMatchObject({ configured: false, items: [] });
    expect(inbox.missingSecrets).toHaveLength(4);
  });

  it("auto-replies in-thread to a positive reply with the threading headers and unsubscribe link", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    const result = await runProspectReplies(db);
    expect(result).toMatchObject({ status: "done", stored: 1, autoReplied: 1, drafted: 0 });
    expect(sends).toHaveLength(1);
    expect(sends[0]!.threadId).toBe(THREAD);
    const { head, text } = sentText();
    expect(head).toContain("In-Reply-To: <in1@mail.test>");
    expect(head).toContain("References: <revora.first@revora.test> <in1@mail.test>");
    expect(head).toContain("Subject: Re: A free website draft for Triangle Comfort");
    expect(head).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(text).toContain(PREVIEW);
    expect(text).toMatch(/Unsubscribe: https:\/\/revoragrowthsystems\.com\/unsubscribe\/outreach\/[a-f0-9]{48}/);
    const reply = tables["prospect_outreach"]!.find((row) => row["kind"] === "reply")!;
    expect(reply).toMatchObject({ mode: "autopilot", channel: "email", reason: "auto_reply", status: "sent", gmail_thread_id: THREAD });
    expect(tables["prospect_inbound"]![0]).toMatchObject({ intent: "positive", status: "handled", action: "auto_replied" });

    // The same message on the next poll is not stored or answered again.
    expect(await runProspectReplies(db)).toMatchObject({ stored: 0, autoReplied: 0 });
    expect(sends).toHaveLength(1);
  });

  it("turns a stop reply into do-not-contact with no reply and no draft", async () => {
    setGmail();
    ai.intent = '{"intent":"positive","confidence":0.95}';
    threadMessages = [inbound("in1", "Please remove me from your list", { from: "boss@triangle.com" })];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()], prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", status: "queued", not_before: "2026-10-19T19:00:00Z", attempts: 0 }] }));
    const result = await runProspectReplies(db);
    expect(result).toMatchObject({ stopped: 1, autoReplied: 0, drafted: 0 });
    expect(sends).toHaveLength(0);
    expect(await isDoNotContact(db, "boss@triangle.com")).toBe(true);
    expect(await isDoNotContact(db, "owner@triangle.com")).toBe(true);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ intent: "stop", intent_source: "keyword", status: "handled", action: "do_not_contact" });
    expect(tables["prospect_send_queue"]![0]).toMatchObject({ status: "cancelled" });
    // The operator can't answer it either.
    const approved = await approveReplyDraft(db, { inboundId: String(tables["prospect_inbound"]![0]!["id"]), body: "Sorry!", actorId: "admin" });
    expect(approved).toMatchObject({ ok: false, reason: "do_not_contact" });
  });

  it("stops a reply typed below the quoted history even with the AI down", async () => {
    isolateProviderEnvironment();
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    vi.stubGlobal("fetch", gmailFetch);
    setGmail();
    ai.intent = new Error("provider down");
    threadMessages = [inbound("in1", "", { below: "Please don’t email us again, take us off your list." })];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ stopped: 1, autoReplied: 0, drafted: 0 });
    expect(sends).toHaveLength(0);
    expect(generateText).not.toHaveBeenCalled();
    expect(await isDoNotContact(db, "owner@triangle.com")).toBe(true);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ intent: "stop", intent_source: "keyword", action: "do_not_contact", body: "Please don’t email us again, take us off your list." });
  });

  it("drafts instead of sending when the reply fails the facts-only check", async () => {
    setGmail();
    ai.intent = '{"intent":"price","confidence":0.9}';
    ai.reply = '{"body":"It is just $199 to start, with a 50% discount!"}';
    threadMessages = [inbound("in1", "How much does it cost?")];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    const row = tables["prospect_inbound"]![0]!;
    expect(row).toMatchObject({ status: "awaiting_operator", action: "drafted" });
    expect(String(row["draft_reason"])).toMatch(/^fact_check_failed/);
  });

  it("drafts instead of sending when the second-pass review fails", async () => {
    setGmail();
    ai.review = '{"pass":false,"problems":["claims results"]}';
    threadMessages = [inbound("in1", "Sounds great")];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    expect(String(tables["prospect_inbound"]![0]!["draft_reason"])).toMatch(/^review_failed: claims results/);

    // The operator edits and sends it in-thread.
    const id = String(tables["prospect_inbound"]![0]!["id"]);
    expect(await approveReplyDraft(db, { inboundId: id, body: `Thanks! Here it is: ${PREVIEW}`, actorId: "admin" })).toMatchObject({ ok: true });
    expect(sends).toHaveLength(1);
    expect(sends[0]!.threadId).toBe(THREAD);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ status: "handled", action: "draft_sent" });
    expect(tables["prospect_outreach"]!.find((r) => r["reason"] === "draft_approved")).toMatchObject({ mode: "manual", kind: "reply" });
    // A second tap does nothing.
    expect(await approveReplyDraft(db, { inboundId: id, body: "again", actorId: "admin" })).toMatchObject({ ok: false, reason: "already_handled" });
    expect(sends).toHaveLength(1);
  });

  it("stops auto-replying after two automatic replies in a thread", async () => {
    setGmail();
    threadMessages = [inbound("in3", "One more question: can I change the colors?")];
    ai.intent = '{"intent":"question","confidence":0.9}';
    const priorReply = (n: number): Row => ({ ...sentOutreach({ id: crypto.randomUUID(), kind: "reply", reason: "auto_reply", gmail_id: `r${n}` }) });
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach(), priorReply(1), priorReply(2)] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ draft_reason: "auto_reply_limit" });
  });

  it("never auto-answers objections, unclear replies or anger", async () => {
    setGmail();
    ai.intent = '{"intent":"objection","confidence":0.9}';
    threadMessages = [inbound("in1", "We already have a guy for this."), inbound("in2", "This is SPAM and a scam, my attorney will hear about it", { at: "2026-10-19T17:05:00Z" })];
    ai.reply = `{"body":"Understood, thanks for letting me know. ${PREVIEW}"}`;
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 2 });
    expect(sends).toHaveLength(0);
    const reasons = tables["prospect_inbound"]!.map((row) => row["draft_reason"]);
    expect(reasons).toEqual(["intent_objection", "legal_threat"]);
  });
});

describe("outreach send queue", () => {
  it("spaces autopilot items 0-20 minutes apart and dedupes a repeat enqueue", async () => {
    const { db, tables } = fakeDb(demoSeed());
    const now = new Date("2026-10-19T18:00:00Z");
    const first = await enqueueOutreach(db, { organizationId: ORG, channel: "email", to: "owner@triangle.com" }, { now, random: () => 0.5 });
    const second = await enqueueOutreach(db, { organizationId: ORG2, channel: "email", to: "hi@bullcity.com" }, { now, random: () => 0.999 });
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(second).toMatchObject({ ok: true, duplicate: false });
    const a = Date.parse(first.ok ? first.notBefore : "");
    const b = Date.parse(second.ok ? second.notBefore : "");
    expect(a - now.getTime()).toBe(10 * 60_000);
    expect(b - a).toBeGreaterThan(19 * 60_000);
    expect(b - a).toBeLessThanOrEqual(20 * 60_000);
    expect(await enqueueOutreach(db, { organizationId: ORG, channel: "email", to: "owner@triangle.com" }, { now })).toMatchObject({ ok: true, duplicate: true });
    expect(tables["prospect_send_queue"]).toHaveLength(2);
  });

  it("leases each due item to one drain only, and frees it again when the lease expires", async () => {
    const due = { status: "queued", not_before: "2026-10-19T17:00:00Z", attempts: 0, channel: "email" };
    const { db, tables } = fakeDb({
      prospect_send_queue: [
        { id: "q1", organization_id: ORG, recipient: "owner@triangle.com", ...due },
        { id: "q2", organization_id: ORG2, recipient: "hi@bullcity.com", ...due },
        { id: "q3", organization_id: ORG, recipient: "x@y.com", ...due, channel: "sms", not_before: "2026-10-19T19:00:00Z" },
      ],
    });
    const [a, b] = await Promise.all([claimQueuedOutreach(db, "drain-a", 1), claimQueuedOutreach(db, "drain-b", 5)]);
    expect(a.map((r) => r.id)).toEqual(["q1"]);
    expect(b.map((r) => r.id)).toEqual(["q2"]);
    expect(await claimQueuedOutreach(db, "drain-c", 5)).toEqual([]);
    vi.setSystemTime(new Date("2026-10-19T18:06:00Z"));
    const reclaimed = await claimQueuedOutreach(db, "drain-c", 5);
    expect(reclaimed.map((r) => r.id)).toEqual(["q1", "q2"]);
    expect(tables["prospect_send_queue"]!.find((r) => r["id"] === "q1")).toMatchObject({ lease_owner: "drain-c", attempts: 2 });
  });

  it("drains through sendDemoOutreach once, then never sends the item again", async () => {
    const { db, tables } = fakeDb(demoSeed({ prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", mode: "autopilot", status: "queued", not_before: "2026-10-19T17:59:00Z", attempts: 0 }] }));
    expect(await drainSendQueue(db)).toMatchObject({ claimed: 1, sent: 1 });
    expect(await drainSendQueue(db)).toMatchObject({ claimed: 0, sent: 0 });
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(tables["prospect_send_queue"]![0]).toMatchObject({ status: "sent", leased_until: null });
    expect(tables["prospect_outreach"]![0]).toMatchObject({ mode: "autopilot", status: "sent" });
  });

  it("backs off on transient provider errors and gives up after three attempts", async () => {
    setGmail();
    sendStatus = 503;
    const { db, tables } = fakeDb(demoSeed({ prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", mode: "autopilot", status: "queued", not_before: "2026-10-19T17:59:00Z", attempts: 0 }] }));
    const row = () => tables["prospect_send_queue"]![0]!;
    for (let attempt = 1; attempt <= MAX_QUEUE_ATTEMPTS; attempt += 1) {
      vi.setSystemTime(new Date(Date.parse(String(row()["not_before"])) + 1000));
      await drainSendQueue(db);
      expect(row()["attempts"]).toBe(attempt);
      expect(row()["last_error"]).toBe("gmail_unavailable");
    }
    expect(row()["status"]).toBe("failed");
    // Each drain tried Gmail's send up to three times with backoff.
    expect(gmailFetch.mock.calls.filter(([url]) => String(url).endsWith("/messages/send"))).toHaveLength(9);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("cancels an item whose contact is on do-not-contact", async () => {
    const { db, tables } = fakeDb(demoSeed({
      prospect_do_not_contact: [{ value: "owner@triangle.com", kind: "email" }],
      prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", mode: "autopilot", status: "queued", not_before: "2026-10-19T17:59:00Z", attempts: 0 }],
    }));
    expect(await enqueueOutreach(db, { organizationId: ORG, channel: "email", to: "owner@triangle.com" })).toMatchObject({ ok: false, reason: "do_not_contact" });
    expect(await drainSendQueue(db)).toMatchObject({ cancelled: 1 });
    expect(tables["prospect_send_queue"]![0]).toMatchObject({ status: "cancelled", last_error: "do_not_contact" });
  });
});

describe("sendDemoOutreach with Gmail and the launch gate", () => {
  const email = { organizationId: ORG, channel: "email" as const, to: "owner@triangle.com", mode: "manual" as const, actorId: "admin" };

  it("keeps the Lovable email path unchanged when Gmail isn't configured", async () => {
    const { db, tables } = fakeDb(demoSeed());
    expect((await sendDemoOutreach(db, email)).ok).toBe(true);
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(gmailFetch).not.toHaveBeenCalled();
    expect(tables["prospect_outreach"]![0]!["gmail_thread_id"]).toBeUndefined();
  });

  it("sends through Gmail with List-Unsubscribe headers, the CAN-SPAM footer, and stores the thread", async () => {
    setGmail();
    const { db, tables } = fakeDb(demoSeed());
    expect((await sendDemoOutreach(db, email)).ok).toBe(true);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
    const { head, text } = sentText();
    expect(head).toContain('From: "Revora Growth Systems" <sam@revora.test>');
    expect(head).not.toContain("Reply-To:");
    expect(head).toMatch(/List-Unsubscribe: <https:\/\/revoragrowthsystems\.com\/unsubscribe\/outreach\/[a-f0-9]{48}>/);
    expect(head).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    const { OUTREACH_PROMOTIONAL_NOTICE } = await import("@/lib/outreach-notice");
    expect(text).toContain(OUTREACH_PROMOTIONAL_NOTICE);
    expect(text).toContain("123 Main St, Raleigh, NC 27601");
    expect(text).toContain(PREVIEW);
    expect(tables["prospect_outreach"]![0]).toMatchObject({ status: "sent", provider: "gmail", gmail_id: "sent1", gmail_thread_id: "newthread1" });
    expect(String(tables["prospect_outreach"]![0]!["rfc_message_id"])).toMatch(/^<revora\..+@revora\.test>$/);
  });

  it("records a Gmail rejection as failed with a plain reason", async () => {
    setGmail();
    sendStatus = 403;
    const { db, tables } = fakeDb(demoSeed());
    expect(await sendDemoOutreach(db, email)).toMatchObject({ ok: false, reason: "gmail_auth_failed" });
    expect(tables["prospect_outreach"]![0]).toMatchObject({ status: "failed", reason: "gmail_auth_failed" });
  });

  it("blocks on the launch gate; force overrides quality findings but never safety ones", async () => {
    const { db, tables } = fakeDb(demoSeed());
    setOutreachGateForTests(async () => ({ ok: false, blockers: [{ code: "low_contrast", message: "Body text contrast is 3.1:1." }] }));
    const blocked = await sendDemoOutreach(db, email);
    expect(blocked).toMatchObject({ ok: false, reason: "quality_gate" });
    expect(blocked.ok ? "" : blocked.message).toContain("contrast is 3.1:1");
    expect(tables["prospect_outreach"]![0]).toMatchObject({ status: "skipped", reason: "quality_gate" });
    expect(await sendDemoOutreach(db, { ...email, mode: "autopilot", actorId: null, force: true })).toMatchObject({ ok: false, reason: "quality_gate" });
    expect((await sendDemoOutreach(db, { ...email, force: true })).ok).toBe(true);

    setOutreachGateForTests(async () => ({ ok: false, blockers: [{ code: "fabricated_claim", message: "Mentions 500 reviews that don't exist." }] }));
    const other = fakeDb(demoSeed());
    expect(await sendDemoOutreach(other.db, { ...email, force: true })).toMatchObject({ ok: false, reason: "quality_gate" });

    setOutreachGateForTests(async () => {
      throw new Error("gate down");
    });
    expect(await sendDemoOutreach(fakeDb(demoSeed()).db, { ...email, force: true })).toMatchObject({ ok: false, reason: "quality_gate" });
  });

  it("raises the default daily email cap to 40, still overridable", () => {
    expect(DEFAULT_DAILY_EMAIL_CAP).toBe(40);
    expect(dailyCap("email")).toBe(40);
    process.env["OUTREACH_DAILY_EMAIL_CAP"] = "12";
    expect(dailyCap("email")).toBe(12);
  });
});

describe("Jarvis inbox.list", () => {
  it("is a read action", () => {
    expect(parseActions([{ id: "inbox.list", args: {} }], []).reads).toEqual([{ id: "inbox.list" }]);
  });
});
