import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";

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
import { gmailConfig, resetGmailTokenCache, setGmailSleepForTests, GMAIL_SECRETS } from "@/lib/gmail/client.server";
import { base64UrlDecode, base64UrlEncode, buildMimeMessage, buildRawMessage, parseGmailMessage, stripQuotedReply } from "@/lib/gmail/mime.server";
import { isDoNotContact, sendDemoOutreach, setOutreachGateForTests, DEFAULT_DAILY_EMAIL_CAP, dailyCap } from "@/lib/prospect-outreach.server";
import {
  autoReplyDecision,
  buildFactsSheet,
  factCheckReply,
  fallbackDraft,
  keywordIntent,
  MAX_AUTO_REPLIES_PER_THREAD,
  parseReviewVerdict,
  replySubject,
  resolveIntent,
  riskFlags,
} from "@/lib/prospect-replies";
import { runProspectReplies, approveReplyDraft, listProspectInbox, sendThreadReply } from "@/lib/prospect-replies.server";
import { claimQueuedOutreach, drainSendQueue, enqueueOutreach, MAX_QUEUE_ATTEMPTS } from "@/lib/prospect-send-queue.server";
import { parseActions } from "@/lib/jarvis-actions";

type Row = Record<string, unknown>;

/** Writes a test can make fail, e.g. the do-not-contact upsert. */
type Faults = { failUpsert?: string[]; missingPollLock?: boolean };

/** In-memory Supabase stand-in covering the filters, returning updates, unique keys and the queue claim RPC. */
function fakeDb(seed: Record<string, Row[]>, faults: Faults = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const table = (name: string) => (tables[name] ??= []);
  const pollClaims: Array<{ p_owner: string; p_seconds: number }> = [];
  const autoReply = (row: Row) => row["kind"] === "reply" && row["mode"] === "autopilot";
  /** prospect_outreach_auto_reply_seq_check: automatic replies carry slot 1 or 2, nothing else does. */
  const checkViolation = (name: string, row: Row) =>
    name === "prospect_outreach" && (autoReply(row) ? ![1, 2].includes(row["auto_reply_seq"] as number) : row["auto_reply_seq"] != null);
  const uniqueViolation = (name: string, row: Row) => {
    const rows = table(name);
    if (name === "prospect_inbound") return rows.some((r) => r["gmail_message_id"] === row["gmail_message_id"]);
    if (name === "prospect_send_queue")
      return row["status"] === "queued" && rows.some((r) => r["status"] === "queued" && r["organization_id"] === row["organization_id"] && r["channel"] === row["channel"]);
    if (name === "prospect_outreach" && autoReply(row))
      // prospect_outreach_auto_reply_slot_idx
      return row["status"] === "sent" && rows.some((r) => autoReply(r) && r["status"] === "sent" && r["gmail_thread_id"] === row["gmail_thread_id"] && r["auto_reply_seq"] === row["auto_reply_seq"]);
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
    const orders: Array<{ column: string; ascending: boolean; nullsFirst: boolean }> = [];
    const compare = (a: Row, b: Row) => {
      for (const { column, ascending, nullsFirst } of orders) {
        const x = a[column];
        const y = b[column];
        if (x == null && y == null) continue;
        if (x == null || y == null) return (x == null) === nullsFirst ? -1 : 1;
        if (String(x) !== String(y)) return (String(x) < String(y) ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    };
    const matches = () => {
      let rows = table(name).filter((row) => filters.every((f) => f(row)));
      if (orders.length) rows = [...rows].sort(compare);
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
      // Postgres defaults: ASC NULLS LAST, DESC NULLS FIRST.
      order: (column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => (
        orders.push({ column, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst ?? opts?.ascending === false }), chain
      ),
      limit: (n: number) => ((limit = n), chain),
      update: (values: Row) => ((op = "update"), (patch = values), chain),
      delete: () => ((op = "delete"), chain),
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
      insert: async (row: Row) => {
        const full: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
        if (checkViolation(name, full)) return { error: { code: "23514", message: "check constraint" } };
        if (uniqueViolation(name, full)) return { error: { code: "23505", message: "duplicate key" } };
        table(name).push(full);
        return { error: null };
      },
      upsert: async (row: Row, opts?: { ignoreDuplicates?: boolean }) => {
        if (faults.failUpsert?.includes(name)) return { error: { message: "connection reset" } };
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
  const rpc = async (fn: string, args: { p_owner: string; p_limit: number; p_lease_seconds: number; p_seconds: number }) => {
    if (fn === "claim_prospect_reply_poll") {
      // Same semantics as the migration: one UPDATE on the singleton, only while the lease is free or expired.
      if (faults.missingPollLock) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.claim_prospect_reply_poll(p_owner, p_seconds) in the schema cache" } };
      const state = table("prospect_reply_poll_state");
      if (!state.length) state.push({ id: 1, last_result: {} });
      const row = state[0]!;
      const nowIso = new Date().toISOString();
      if (row["leased_until"] != null && String(row["leased_until"]) >= nowIso) return { data: [], error: null };
      row["leased_until"] = new Date(Date.now() + args.p_seconds * 1000).toISOString();
      row["lease_owner"] = args.p_owner;
      pollClaims.push(args);
      return { data: [{ ...row }], error: null };
    }
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
  return { db: { from, rpc } as never, tables, pollClaims };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG2 = "33333333-3333-4333-8333-333333333333";
const PREVIEW = "https://revoragrowthsystems.com/p/tok_abcdefghijklmnopqrst";
const CLAIM = "https://revoragrowthsystems.com/get-started?claim=tok_abcdefghijklmnopqrst";

function demoSeed(extra: Record<string, Row[]> = {}) {
  return {
    prospect_autopilot_settings: [{ id: 1, enabled: true, send_email: true, send_sms: true }],
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
function inbound(id: string, text: string, opts: { from?: string; subject?: string; at?: string; thread?: string; headers?: Array<{ name: string; value: string }>; below?: string } = {}) {
  return {
    id,
    threadId: opts.thread ?? THREAD,
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

/** Messages of every thread, unless threadsById names that thread. */
let threadMessages: unknown[] = [];
const threadsById = new Map<string, unknown[]>();
/** Thread ids read, in order. */
const fetchedThreads: string[] = [];
let threadStatus = 200;
let tokenStatus = 200;
let sendStatus = 200;
const sends: Array<{ raw: string; threadId?: string }> = [];
const gmailFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://oauth2.googleapis.com/token"))
    return tokenStatus === 200 ? new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 }) : new Response('{"error":"invalid_grant"}', { status: tokenStatus });
  if (url.endsWith("/messages/send")) {
    if (sendStatus !== 200) return new Response("{}", { status: sendStatus });
    const body = JSON.parse(String(init?.body)) as { raw: string; threadId?: string };
    sends.push(body);
    return new Response(JSON.stringify({ id: `sent${sends.length}`, threadId: body.threadId ?? `newthread${sends.length}` }), { status: 200 });
  }
  if (url.includes("/threads/")) {
    const id = url.match(/\/threads\/([^?]+)/)?.[1] ?? "";
    fetchedThreads.push(id);
    if (threadStatus !== 200) return new Response("{}", { status: threadStatus });
    return new Response(JSON.stringify({ id, messages: threadsById.get(id) ?? threadMessages }), { status: 200 });
  }
  return new Response("not found", { status: 404 });
});

const sentText = (index = 0) => {
  const mime = base64UrlDecode(sends[index]!.raw);
  const [head, body] = mime.split("\r\n\r\n");
  return { head: head!, text: Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8") };
};

beforeEach(() => {
  // No deployment AI credential may reach a provider; the Gmail stub below replaces the guard fetch.
  isolateProviderEnvironment();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env["REVORA_MAILING_ADDRESS"] = "123 Main St, Raleigh, NC 27601";
  resetGmailTokenCache();
  setGmailSleepForTests(async () => undefined);
  setOutreachGateForTests(null);
  threadMessages = [];
  threadsById.clear();
  fetchedThreads.length = 0;
  threadStatus = 200;
  tokenStatus = 200;
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
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Gmail MIME building", () => {
  it("reads an HTML-only reply as text, dropping scripts, styles and odd closing tags", () => {
    const html = '<style>p{color:red}</style ><p>Sounds good &amp;lt;3</p><script>alert("stop")</script\t\n bar><div>What&#39;s next?<br/>Thanks</div>';
    const parsed = parseGmailMessage({
      id: "h1",
      threadId: "t1",
      internalDate: "1",
      payload: { mimeType: "text/html", headers: [{ name: "From", value: "a@b.com" }], body: { data: base64UrlEncode(html) } },
    } as never);
    expect(parsed?.text).toContain("Sounds good &lt;3");
    expect(parsed?.text).toContain("Thanks");
    expect(parsed?.text).not.toMatch(/color|alert|stop/);
  });

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

  it("reads threatening opt-outs and off-list wording as stops, but not site-edit requests", () => {
    for (const text of ["If you don't stop emailing me I'll block you", "If you do not stop sending these", "take me off-list", "take us off-list", "Take us off.", "Please remove us.", "take us off your mailing list"]) {
      expect(keywordIntent(text), text).toBe("stop");
    }
    for (const text of ["Remove us from the testimonials section please", "Looks great but take us off the homepage banner"]) {
      expect(keywordIntent(text), text).toBeNull();
    }
    // A list footer a mail server adds under the quoted history is not the prospect's words.
    const footer = "Thanks!\n\nOn Mon, Oct 19, 2026 Sam wrote:\n> hi\n\n--\nThis message is confidential. To unsubscribe from our newsletters click here.";
    expect(stripQuotedReply(footer)).toBe("Thanks!");
  });

  it("flags off-sheet bare domains after punctuation and accepts the preview link in any case", () => {
    const facts = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: `${PREVIEW}?claim=1`, senderName: "Sam", senderEmail: "sam@revora.test" });
    expect(factCheckReply("Book here...calendly.com/x", facts).join()).toContain("calendly.com/x");
    expect(factCheckReply("Book:-calendly.com/x", facts).join()).toContain("calendly.com/x");
    expect(factCheckReply(`Your draft: ${PREVIEW.replace(/^https?:\/\//, "").toUpperCase().replace("/P/", "/p/")}`, facts).filter((p) => p.includes("bare web address"))).toEqual([]);
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

  it("allows the business's own website domain and the sender's mail domain, any case, and nothing else", () => {
    const facts = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: CLAIM, senderEmail: "sam@Revora.test", businessWebsite: "https://www.TriangleComfort.com/home" });
    expect(facts.businessDomain).toBe("trianglecomfort.com");
    for (const body of [
      "We kept everything from trianglecomfort.com in the draft.",
      "Your current site TriangleComfort.COM stays as it is.",
      "Your site www.trianglecomfort.com stays as it is.",
      "Your site https://TriangleComfort.com/ stays as it is.",
      "Reach us any time at revora.test.",
      "Reach us at https://REVORA.test.",
    ])
      expect(factCheckReply(body, facts), body).toEqual([]);
    const flagged = (body: string) => expect(factCheckReply(body, facts).length, body).toBeGreaterThan(0);
    flagged("See trianglecomfort.com/specials for the deal");
    flagged("See https://trianglecomfort.com/specials");
    flagged("See https://user@trianglecomfort.com");
    flagged("See trianglecomfort.co");
    flagged("See shop.trianglecomfort.com");
    flagged("See revora.test/pricing");
    flagged("See evil.test");
    flagged("Write owner@trianglecomfort.com");

    // No website on the profile, or a social/listing page: no extra domain is allowed.
    const plain = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: CLAIM, senderEmail: "sam@revora.test" });
    expect(plain.businessDomain).toBeUndefined();
    expect(factCheckReply("We kept trianglecomfort.com in mind.", plain).join()).toMatch(/bare web address/);
    const social = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: CLAIM, senderEmail: "sam@revora.test", businessWebsite: "facebook.com/trianglecomfort" });
    expect(social.businessDomain).toBeUndefined();
    expect(factCheckReply("Find us on facebook.com", social).join()).toMatch(/bare web address/);
  });
});

describe("single-flight run lock", () => {
  it("claims the lease, releases it at the end, and answers busy while another run holds it", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const { db, tables, pollClaims } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()], prospect_reply_poll_state: [{ id: 1, last_result: {} }] }));
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", stored: 1, autoReplied: 0, drafted: 1 });
    expect(pollClaims).toHaveLength(1);
    expect(pollClaims[0]!.p_seconds).toBe(15 * 60);
    // Released: the next run can claim again.
    expect(tables["prospect_reply_poll_state"]![0]).toMatchObject({ lease_owner: null, leased_until: null });

    // Another run holds an unexpired lease: nothing is drained, read or sent.
    Object.assign(tables["prospect_reply_poll_state"]![0]!, { lease_owner: "other-run", leased_until: "2026-10-19T18:10:00.000Z" });
    threadMessages = [inbound("in2", "Also, what does it cost?")];
    gmailFetch.mockClear();
    const busy = await runProspectReplies(db);
    expect(busy).toMatchObject({ status: "busy", stored: 0, threadsChecked: 0, queue: null });
    expect(gmailFetch).not.toHaveBeenCalled();
    // The other run's lease is left alone.
    expect(tables["prospect_reply_poll_state"]![0]).toMatchObject({ lease_owner: "other-run", leased_until: "2026-10-19T18:10:00.000Z" });

    // An expired lease (a run that died) is claimed again.
    tables["prospect_reply_poll_state"]![0]!["leased_until"] = "2026-10-19T17:00:00.000Z";
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", stored: 1 });
    expect(pollClaims).toHaveLength(2);
    expect(tables["prospect_reply_poll_state"]![0]).toMatchObject({ lease_owner: null, leased_until: null });
  });

  it("releases the lease when Gmail isn't configured", async () => {
    const { db, tables, pollClaims } = fakeDb(demoSeed());
    expect((await runProspectReplies(db)).status).toBe("gmail_not_configured");
    expect(pollClaims).toHaveLength(1);
    expect(tables["prospect_reply_poll_state"]![0]).toMatchObject({ lease_owner: null, leased_until: null });
  });

  it("runs without the lock, and logs it, when the migration isn't applied", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => warn.mockRestore());
    const { db, pollClaims } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }), { missingPollLock: true });
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", stored: 1, autoReplied: 0, drafted: 1 });
    expect(pollClaims).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("claim_prospect_reply_poll is missing"));
  });

  it("skips the run when the claim itself fails for another reason", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => error.mockRestore());
    const db = { rpc: async () => ({ data: null, error: { code: "08006", message: "connection failure" } }), from: () => { throw new Error("must not read"); } } as never;
    expect(await runProspectReplies(db)).toMatchObject({ status: "failed", stored: 0, queue: null });
  });

  it("migration adds the lease columns and a locked-down SECURITY INVOKER claim function", () => {
    const sql = readFileSync("supabase/migrations/20261020120100_prospect_reply_poll_lock.sql", "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS lease_owner TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ/);
    expect(sql).toMatch(/FUNCTION public\.claim_prospect_reply_poll\(p_owner TEXT, p_seconds INTEGER/);
    expect(sql).toMatch(/SECURITY INVOKER\s+SET search_path = public/);
    expect(sql).toMatch(/WHERE s\.id = 1\s+AND \(s\.leased_until IS NULL OR s\.leased_until < now\(\)\)\s+RETURNING/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.claim_prospect_reply_poll\(TEXT, INTEGER\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_prospect_reply_poll\(TEXT, INTEGER\) TO service_role/);
  });
});

describe("reply polling and follow-up", () => {
  it("lets an automatic reply name the business's own website domain from its profile", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    ai.reply = `{"body":"Great to hear! We kept the details from TriangleComfort.com. Your draft is here: ${PREVIEW}"}`;
    const seed: Record<string, Row[]> = demoSeed({ prospect_outreach: [sentOutreach()] });
    seed["business_profiles"]![0] = { ...seed["business_profiles"]![0]!, website: "https://www.trianglecomfort.com" };
    const { db, tables } = fakeDb(seed);
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ status: "awaiting_operator", action: "drafted", draft_reason: "owner_approval_required" });
    expect(String(tables["prospect_inbound"]![0]!["draft_text"])).toContain("TriangleComfort.com");
  });

  it("drafts instead when the reply names the business domain but the profile lists no website", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    ai.reply = `{"body":"Great to hear! We kept the details from trianglecomfort.com. Your draft is here: ${PREVIEW}"}`;
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", autoReplied: 0, drafted: 1 });
    expect(String(tables["prospect_inbound"]![0]!["draft_reason"])).toMatch(/bare web address not in the facts sheet: trianglecomfort\.com/);
  });

  it("returns gmail_not_configured cleanly and names the four secrets", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
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

  it("never sends a positive reply by itself: it saves a draft, and sends in-thread only when an operator approves that item", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    const result = await runProspectReplies(db);
    expect(result).toMatchObject({ status: "done", stored: 1, autoReplied: 0, drafted: 1 });
    // Autopilot AND send-email are both ON in this seed, and still nothing is sent.
    expect(sends).toHaveLength(0);
    expect(tables["prospect_outreach"]!.filter((row) => row["kind"] === "reply")).toHaveLength(0);
    const row = tables["prospect_inbound"]![0]!;
    expect(row).toMatchObject({ intent: "positive", status: "awaiting_operator", action: "drafted", draft_reason: "owner_approval_required" });
    expect(String(row["draft_text"])).toContain(PREVIEW);

    // A later poll does not send it either.
    expect(await runProspectReplies(db)).toMatchObject({ stored: 0, autoReplied: 0 });
    expect(sends).toHaveLength(0);

    // The operator approves this specific item: only now does it go out, in-thread.
    const approved = await approveReplyDraft(db, { inboundId: String(row["id"]), body: String(row["draft_text"]), actorId: "admin" });
    expect(approved.ok).toBe(true);
    expect(sends).toHaveLength(1);
    expect(sends[0]!.threadId).toBe(THREAD);
    const { head, text } = sentText();
    expect(head).toContain("In-Reply-To: <in1@mail.test>");
    expect(head).toContain("References: <revora.first@revora.test> <in1@mail.test>");
    expect(head).toContain("Subject: Re: A free website draft for Triangle Comfort");
    expect(head).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(text).toContain(PREVIEW);
    expect(text).toMatch(/Unsubscribe: https:\/\/revoragrowthsystems\.com\/unsubscribe\/outreach\/[a-f0-9]{48}/);
    const reply = tables["prospect_outreach"]!.find((r) => r["kind"] === "reply")!;
    expect(reply).toMatchObject({ mode: "manual", channel: "email", reason: "draft_approved", status: "sent", sent_by: "admin", gmail_thread_id: THREAD });
    expect(tables["prospect_inbound"]![0]).toMatchObject({ status: "handled", action: "draft_sent" });
  });

  it("drafts a positive reply even when the autopilot switches are off, and when they are on", async () => {
    for (const settings of [{ enabled: false, send_email: false }, { enabled: true, send_email: true }, { enabled: true, send_email: false }]) {
      vi.clearAllMocks();
      sends.length = 0;
      setGmail();
      threadMessages = [inbound("in1", "How much does it cost?")];
      const seed = demoSeed({ prospect_outreach: [sentOutreach()] });
      seed.prospect_autopilot_settings = [{ id: 1, ...settings, send_sms: false }];
      const { db, tables } = fakeDb(seed);
      expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
      expect(sends).toHaveLength(0);
      expect(tables["prospect_outreach"]!.filter((row) => row["kind"] === "reply")).toHaveLength(0);
    }
  });

  it("refuses to send from any automatic caller, whatever the settings", async () => {
    setGmail();
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    const item = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organizationId: ORG, businessName: null, threadId: THREAD, from: "owner@triangle.com",
      subject: "Re: A free website draft for Triangle Comfort", snippet: null, body: "Sounds good", receivedAt: "2026-10-19T17:00:00.000Z",
      intent: "positive" as const, confidence: 0.9, intentSource: "ai", flags: [], status: "processing", action: null, handledAt: null,
      draftSubject: null, draftText: null, draftReason: null, rfcMessageId: "<in2@mail.test>", references: ["<revora.first@revora.test>"],
    };
    expect(await sendThreadReply(db, gmailConfig()!, { inbound: item, body: `Thanks! ${PREVIEW}`, mode: "autopilot", reason: "auto_reply", actorId: null })).toEqual({ ok: false, reason: "approval_required" });
    expect(await sendThreadReply(db, gmailConfig()!, { inbound: item, body: `Thanks! ${PREVIEW}`, mode: "manual", reason: "x", actorId: null })).toEqual({ ok: false, reason: "approval_required" });
    expect(sends).toHaveLength(0);
    expect(tables["prospect_outreach"]!.filter((row) => row["kind"] === "reply")).toHaveLength(0);
  });

  it("a refund question is always a draft and the facts sheet carries the refund policy", async () => {
    expect(riskFlags("Can I get a refund if I don't like it?")).toContain("refund");
    expect(riskFlags("is there a money-back guarantee")).toContain("refund");
    expect(autoReplyDecision({ intent: "question", flags: ["refund"], priorAutoReplies: 0, demoAvailable: true })).toEqual({ auto: false, reason: "refund_question" });
    const facts = buildFactsSheet({ businessName: "Triangle Comfort", previewUrl: PREVIEW, claimUrl: CLAIM, senderEmail: "sam@revora.test" });
    expect(facts.refundPolicy).toBe(
      "Your $350 setup fee is fully refundable within 7 days if we haven't started your build. Your monthly plan is month-to-month, so cancel anytime and you won't be billed again. Charges already made aren't refunded.",
    );
    expect(factCheckReply(facts.refundPolicy, facts)).toEqual([]);
    expect(facts.pricingSummary).toBe("$350 setup, first month free, then $100/month; 3-day trial, no card needed.");
    setGmail();
    threadMessages = [inbound("in1", "Is this refundable? Can I get my money back?")];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ status: "awaiting_operator", draft_reason: "refund_question" });
  });

  it("classifies, writes and reviews on the shared router lane with no free-only flag", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const { db } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    const calls = vi.mocked(generateText).mock.calls;
    // Intent, reply and second-pass review all went through the router.
    expect(calls).toHaveLength(3);
    for (const [caller, request] of calls) {
      expect(caller).toMatchObject({ task: "admin.jarvis" });
      // There is no free lane any more: the call uses the Lovable team under
      // the router's daily paid-cap reservation, never a dead freeOnly flag.
      expect(request).not.toHaveProperty("freeOnly");
      expect(request).not.toHaveProperty("paidOnly");
    }
    expect(readFileSync(new URL("./prospect-replies.server.ts", import.meta.url), "utf8")).not.toMatch(/freeOnly/);
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

  it("cancels a waiting automatic follow-up when the prospect answers, and leaves other sends alone", async () => {
    setGmail();
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const { db, tables } = fakeDb(
      demoSeed({
        prospect_outreach: [sentOutreach()],
        prospect_send_queue: [
          { id: "q1", organization_id: ORG, channel: "email", kind: "follow_up", recipient: "owner@triangle.com", status: "queued", not_before: "2026-10-30T19:00:00Z", attempts: 0 },
          { id: "q2", organization_id: ORG, channel: "sms", kind: "first_touch", recipient: "+19195550100", status: "queued", not_before: "2026-10-30T19:00:00Z", attempts: 0 },
        ],
      }),
    );
    await runProspectReplies(db);
    const queue = tables["prospect_send_queue"]!;
    expect(queue.find((r) => r["id"] === "q1")).toMatchObject({ status: "cancelled", last_error: "prospect_replied" });
    expect(queue.find((r) => r["id"] === "q2")).toMatchObject({ status: "queued" });
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
    const priorReply = (n: number): Row => ({ ...sentOutreach({ id: crypto.randomUUID(), kind: "reply", reason: "auto_reply", gmail_id: `r${n}`, auto_reply_seq: n }) });
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

  it("reads every thread in the 30-day window across runs, so a stop on an older thread still lands", async () => {
    setGmail();
    // 150 first touches, one every 4 hours (about 25 days); the oldest thread holds a stop.
    const thread = (i: number) => `thread${String(i).padStart(3, "0")}`;
    const outreach = Array.from({ length: 150 }, (_, i) =>
      sentOutreach({ id: crypto.randomUUID(), recipient: `p${i}@example.com`, gmail_thread_id: thread(i), created_at: new Date(Date.parse("2026-10-19T17:00:00Z") - i * 4 * 3_600_000).toISOString() }),
    );
    threadsById.set(thread(149), [inbound("stop149", "Please stop emailing me", { from: "p149@example.com", thread: thread(149), at: "2026-10-19T12:00:00Z" })]);
    const { db } = fakeDb(demoSeed({ prospect_outreach: outreach }));

    expect(await runProspectReplies(db)).toMatchObject({ status: "done", threadsChecked: 100, stopped: 0 });
    expect(fetchedThreads[0]).toBe(thread(0));
    expect(await isDoNotContact(db, "p149@example.com")).toBe(false);

    vi.setSystemTime(new Date("2026-10-19T18:10:00Z"));
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", threadsChecked: 100, stopped: 1 });
    // The 50 never-checked threads first, then the least recently checked.
    expect(fetchedThreads.slice(100, 150)).toEqual(Array.from({ length: 50 }, (_, i) => thread(100 + i)));
    expect(new Set(fetchedThreads).size).toBe(150);
    expect(await isDoNotContact(db, "p149@example.com")).toBe(true);
  });

  it("reads replies that arrived during a Gmail outage once Gmail answers again, and fails the outage runs", async () => {
    setGmail();
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()], prospect_reply_poll_state: [{ id: 1, last_polled_at: "2026-10-19T16:00:00.000Z" }] }));
    // The prospect writes "stop" at 17:00, then the refresh token is revoked and Gmail returns 5xx.
    threadMessages = [inbound("in1", "Please stop emailing me", { at: "2026-10-19T17:00:00Z" })];
    tokenStatus = 400;
    const revoked = await runProspectReplies(db);
    expect(revoked).toMatchObject({ status: "failed", stored: 0 });
    expect(revoked.errors.join()).toContain("gmail_auth_failed");

    tokenStatus = 200;
    threadStatus = 503;
    vi.setSystemTime(new Date("2026-10-19T19:00:00Z"));
    const down = await runProspectReplies(db);
    expect(down).toMatchObject({ status: "failed", stored: 0 });
    expect(down.errors.join()).toContain("gmail_unavailable");
    // Neither the poll mark nor the thread's check time moved.
    expect(tables["prospect_reply_poll_state"]![0]!["last_polled_at"]).toBe("2026-10-19T16:00:00.000Z");
    expect(tables["prospect_outreach"]![0]!["replies_checked_at"]).toBeUndefined();

    // Back four hours after the reply, far outside any overlap window.
    threadStatus = 200;
    vi.setSystemTime(new Date("2026-10-19T21:00:00Z"));
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", stored: 1, stopped: 1 });
    expect(await isDoNotContact(db, "owner@triangle.com")).toBe(true);
    expect(tables["prospect_reply_poll_state"]![0]!["last_polled_at"]).toBe("2026-10-19T21:00:00.000Z");
    expect(tables["prospect_outreach"]![0]!["replies_checked_at"]).toBe("2026-10-19T21:00:00.000Z");
  });

  it("keeps a stop whose do-not-contact couldn't be written as a pending stop, and applies it on the next run", async () => {
    setGmail();
    threadMessages = [inbound("in1", "STOP")];
    const faults: Faults = { failUpsert: ["prospect_do_not_contact"] };
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }), faults);
    const first = await runProspectReplies(db);
    expect(first).toMatchObject({ status: "failed", stored: 1, stopped: 0, autoReplied: 0, drafted: 0 });
    expect(first.errors.join()).toContain("do-not-contact");
    // The decision is kept (never re-classified), and it is not marked handled.
    expect(tables["prospect_inbound"]).toHaveLength(1);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ intent: "stop", status: "pending", action: "stop_pending" });
    expect(await isDoNotContact(db, "owner@triangle.com")).toBe(false);

    faults.failUpsert = [];
    vi.mocked(generateText).mockClear();
    vi.setSystemTime(new Date("2026-10-19T18:10:00Z"));
    expect(await runProspectReplies(db)).toMatchObject({ status: "done", stored: 0, autoReplied: 0, drafted: 0 });
    expect(await isDoNotContact(db, "owner@triangle.com")).toBe(true);
    expect(tables["prospect_inbound"]).toHaveLength(1);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ intent: "stop", status: "handled", action: "do_not_contact" });
    expect(generateText).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
  });

  /** A sent automatic reply holding slot `seq` in THREAD. */
  const autoReplyRow = (seq: number): Row => sentOutreach({ id: crypto.randomUUID(), kind: "reply", reason: "auto_reply", gmail_id: `r${seq}`, auto_reply_seq: seq });
  const sentAutoReplies = (rows: Row[]) => rows.filter((row) => row["kind"] === "reply" && row["mode"] === "autopilot" && row["status"] === "sent");

  it("still drafts (never sends) when an overlapping run takes the thread's last automatic slot mid-reply", async () => {
    setGmail();
    const { db, tables } = fakeDb(demoSeed({
      prospect_outreach: [sentOutreach(), autoReplyRow(1)],
      prospect_inbound: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organization_id: ORG, outreach_id: sentOutreach()["id"], thread_id: THREAD, gmail_message_id: "in2",
        rfc_message_id: "<in2@mail.test>", references_ids: ["<revora.first@revora.test>"], from_address: "owner@triangle.com",
        subject: "Re: A free website draft for Triangle Comfort", body: "Sounds good, what's next?", received_at: "2026-10-19T17:00:00.000Z",
        intent: "positive", confidence: 0.9, intent_source: "ai", flags: [], status: "pending",
      }],
    }));
    // This run's early count reads one automatic reply; while it writes, another run sends the second.
    vi.mocked(generateText).mockImplementationOnce(async () => {
      tables["prospect_outreach"]!.push(autoReplyRow(2));
      return { text: `{"body":"Great to hear! Your draft is here: ${PREVIEW}"}` } as never;
    });
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    expect(sentAutoReplies(tables["prospect_outreach"]!)).toHaveLength(MAX_AUTO_REPLIES_PER_THREAD);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ status: "awaiting_operator", action: "drafted", draft_reason: "owner_approval_required" });
  });

  it("keeps an in-thread reply as an operator draft when the mailing address isn't set", async () => {
    setGmail();
    delete process.env["REVORA_MAILING_ADDRESS"];
    threadMessages = [inbound("in1", "Yes, I like it! What next?")];
    const { db, tables } = fakeDb(demoSeed({ prospect_outreach: [sentOutreach()] }));
    expect(await runProspectReplies(db)).toMatchObject({ autoReplied: 0, drafted: 1 });
    expect(sends).toHaveLength(0);
    const row = tables["prospect_inbound"]![0]!;
    expect(row).toMatchObject({ status: "awaiting_operator", action: "drafted", draft_reason: "owner_approval_required" });
    expect(String(row["draft_text"])).toContain(PREVIEW);
    expect(tables["prospect_outreach"]!.filter((r) => r["kind"] === "reply")).toHaveLength(0);

    // The operator can't send it either until the address is set; it stays a draft.
    const approved = await approveReplyDraft(db, { inboundId: String(row["id"]), body: `Thanks! Here it is: ${PREVIEW}`, actorId: "admin" });
    expect(approved).toMatchObject({ ok: false, reason: "mailing_address_missing" });
    expect(approved.ok ? "" : approved.message).toContain("REVORA_MAILING_ADDRESS");
    expect(sends).toHaveLength(0);
    expect(tables["prospect_inbound"]![0]).toMatchObject({ status: "awaiting_operator", action: "drafted" });
  });
});

describe("prospect replies migration", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261019100000_prospect_gmail_replies.sql", import.meta.url), "utf8");

  it("holds the per-thread automatic reply limit in the database", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS auto_reply_seq SMALLINT;");
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_auto_reply_slot_idx\s+ON public\.prospect_outreach \(gmail_thread_id, auto_reply_seq\)\s+WHERE status = 'sent' AND kind = 'reply' AND mode = 'autopilot';/,
    );
    expect(sql).toContain(`THEN auto_reply_seq IS NOT NULL AND auto_reply_seq BETWEEN 1 AND ${MAX_AUTO_REPLIES_PER_THREAD}`);
    expect(sql).toContain("ELSE auto_reply_seq IS NULL");
  });

  it("orders the reply poll's rotation by the thread's last check", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS replies_checked_at TIMESTAMPTZ;");
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS prospect_outreach_reply_poll_idx\s+ON public\.prospect_outreach \(replies_checked_at NULLS FIRST, created_at DESC\)/);
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

  it("holds queued automatic sends while the owner has autopilot switched off", async () => {
    const seed = demoSeed({ prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", mode: "autopilot", status: "queued", not_before: "2026-10-19T17:59:00Z", attempts: 0 }] });
    seed.prospect_autopilot_settings = [{ id: 1, enabled: false, send_email: true, send_sms: true }];
    const { db, tables } = fakeDb(seed);
    expect(await drainSendQueue(db)).toMatchObject({ claimed: 1, sent: 0, retried: 1 });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
    expect(tables["prospect_send_queue"]![0]).toMatchObject({ status: "queued", last_error: "autopilot_paused" });
  });

  it("backs off on Gmail rate limits and gives up after three attempts", async () => {
    setGmail();
    sendStatus = 429;
    const { db, tables } = fakeDb(demoSeed({ prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", mode: "autopilot", status: "queued", not_before: "2026-10-19T17:59:00Z", attempts: 0 }] }));
    const row = () => tables["prospect_send_queue"]![0]!;
    for (let attempt = 1; attempt <= MAX_QUEUE_ATTEMPTS; attempt += 1) {
      vi.setSystemTime(new Date(Date.parse(String(row()["not_before"])) + 1000));
      await drainSendQueue(db);
      expect(row()["attempts"]).toBe(attempt);
      expect(row()["last_error"]).toBe("rate_limited");
    }
    expect(row()["status"]).toBe("failed");
    // Each drain tried Gmail's send up to three times with backoff: a 429 is rejected before acceptance.
    expect(gmailFetch.mock.calls.filter(([url]) => String(url).endsWith("/messages/send"))).toHaveLength(9);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("never resends after a Gmail 5xx on send: recorded as unconfirmed and cancelled", async () => {
    setGmail();
    sendStatus = 500;
    const { db, tables } = fakeDb(demoSeed({ prospect_send_queue: [{ id: "q1", organization_id: ORG, channel: "email", recipient: "owner@triangle.com", mode: "autopilot", status: "queued", not_before: "2026-10-19T17:59:00Z", attempts: 0 }] }));
    expect(await drainSendQueue(db)).toMatchObject({ claimed: 1, cancelled: 1, retried: 0 });
    vi.setSystemTime(new Date("2026-10-20T18:00:00Z"));
    expect(await drainSendQueue(db)).toMatchObject({ claimed: 0 });
    expect(gmailFetch.mock.calls.filter(([url]) => String(url).endsWith("/messages/send"))).toHaveLength(1);
    expect(tables["prospect_send_queue"]![0]).toMatchObject({ status: "cancelled", last_error: "unconfirmed_transport" });
    expect(tables["prospect_outreach"]![0]).toMatchObject({ status: "sent", reason: "unconfirmed_transport", provider: "gmail" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("does not retry a Gmail send whose connection dropped, but still retries thread reads", async () => {
    setGmail();
    const { getGmailThread, gmailConfig, sendGmailRaw } = await import("@/lib/gmail/client.server");
    const config = gmailConfig()!;
    gmailFetch.mockImplementationOnce(async () => new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 }));
    gmailFetch.mockImplementationOnce(async () => {
      throw new TypeError("socket hang up");
    });
    expect(await sendGmailRaw(config, "cmF3")).toMatchObject({ ok: false, reason: "gmail_transport_error", transient: false });
    gmailFetch.mockImplementationOnce(async () => new Response("{}", { status: 503 }));
    expect(await getGmailThread(config, THREAD)).toMatchObject({ ok: true });
    const urls = gmailFetch.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith("/messages/send"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("/threads/"))).toHaveLength(2);
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
