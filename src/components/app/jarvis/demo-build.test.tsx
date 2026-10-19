import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBuildCardView } from "./DemoBuildCard";
import { DemoSendForm } from "./DemoSendSheet";
import {
  DEMO_STATUS_POLL_MS,
  currentStepLabel,
  demoStages,
  findMapsLink,
  normalizeDemoStatus,
  previewFit,
  previewPath,
  readDemoCards,
  readDemoSendProposal,
  rememberDemoCard,
  sendFailureHelp,
  shareLink,
  smsDraft,
  validRecipient,
  type DemoBuildStatus,
} from "./demo-build";

const noop = () => undefined;
const ORG = "11111111-2222-3333-4444-555555555555";
const card = { organizationId: ORG, name: "Triangle Detailing", previewToken: "tok123" };

/** Characters outside any tag, read one by one (no regex tag stripping). */
function textOutsideTags(html: string) {
  let out = "";
  let depth = 0;
  for (const ch of html) {
    if (ch === "<") depth += 1;
    else if (ch === ">") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

/** Every <button> must have an accessible name: an aria-label or visible text. */
function unnamedButtons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(([, attrs, inner]) => {
    if (/aria-label="[^"]+"/.test(attrs ?? "")) return false;
    return !textOutsideTags(inner ?? "").trim();
  });
}

const status = (overrides: Record<string, unknown> = {}): DemoBuildStatus =>
  normalizeDemoStatus({ status: "processing", progress: 46, step: "conversion", previewUrl: "https://app.example.com/p/tok123", claimed: false, outreach: [], email: "owner@triangle.example", phone: "(919) 555-0142", ...overrides });

const view = (data: DemoBuildStatus | null, overrides: Partial<Parameters<typeof DemoBuildCardView>[0]> = {}) => renderToStaticMarkup(
  <DemoBuildCardView
    card={card}
    status={data}
    loadError={null}
    checking={false}
    onRetry={noop}
    device="phone"
    onDeviceChange={noop}
    frameRoom={340}
    origin="https://jarvis.example.com"
    onCopyLink={noop}
    onSend={noop}
    onDismiss={noop}
    {...overrides}
  />,
);

describe("demo build status", () => {
  it("polls every 3 seconds and reads unknown input safely", () => {
    expect(DEMO_STATUS_POLL_MS).toBe(3000);
    expect(normalizeDemoStatus(null).phase).toBe("unavailable");
    expect(normalizeDemoStatus({ status: "queued", progress: 140 }).progress).toBe(100);
    expect(normalizeDemoStatus({ status: "completed" }).phase).toBe("ready");
    expect(normalizeDemoStatus({ status: "failed", error: "Worker died" })).toMatchObject({ phase: "failed", message: "Worker died" });
    const outreach = normalizeDemoStatus({ status: "completed", outreach: [{ channel: "sms", recipient: "+19195550142", status: "failed", reason: "sms_not_configured", mode: "manual", created_at: "2026-10-19T10:00:00Z" }, { channel: "fax", status: "sent" }] }).outreach;
    expect(outreach).toEqual([{ channel: "sms", recipient: "+19195550142", status: "failed", reason: "sms_not_configured", mode: "manual", createdAt: "2026-10-19T10:00:00Z" }]);
  });

  it("marks the real stages from the server's step, not guesses", () => {
    const stages = demoStages("conversion", 46, "active");
    expect(stages.filter((stage) => stage.state === "done").map((stage) => stage.key)).toEqual(["business", "services", "brand", "analysis", "structure", "copy", "conversion"]);
    expect(stages.find((stage) => stage.state === "current")?.key).toBe("pictures");
    expect(demoStages(null, 0, "active").find((stage) => stage.state === "current")?.key).toBe("business");
    expect(demoStages(null, 0, "ready").every((stage) => stage.state === "done")).toBe(true);
    expect(currentStepLabel("conversion", 46, "active")).toBe("Working on: pictures generated and checked");
  });

  it("always embeds the same-origin preview path and shares the full link", () => {
    expect(previewPath("https://app.example.com/p/tok123", "other")).toBe("/p/tok123");
    expect(previewPath(null, "tok 1")).toBe("/p/tok%201");
    expect(previewPath("https://evil.example.com/x", undefined)).toBeNull();
    expect(shareLink(null, "/p/tok123", "https://jarvis.example.com/")).toBe("https://jarvis.example.com/p/tok123");
    expect(previewFit("desktop", 320)).toMatchObject({ width: 1280, scale: 0.25 });
    expect(previewFit("phone", 1000).scale).toBe(1);
  });
});

describe("demo build card", () => {
  it("while building: progress bar, polite live status and the stage list, no preview yet", () => {
    const html = view(status());
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="46"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Triangle Detailing: Working on: pictures generated and checked, 46%");
    expect(html).toContain('aria-label="Build stages"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Stages · 7 of 14 done");
    expect(html).not.toContain("<iframe");
    expect(unnamedButtons(html)).toEqual([]);
  });

  it("when ready: a live preview with width toggles, open, copy, send and history", () => {
    const html = view(status({ status: "completed", progress: 100, outreach: [{ channel: "email", recipient: "owner@triangle.example", status: "sent", reason: null, mode: "manual", created_at: "2026-10-19T10:00:00Z" }, { channel: "sms", recipient: "+19195550142", status: "failed", reason: "sms_not_configured", mode: "manual", created_at: "2026-10-19T10:05:00Z" }] }));
    expect(html).toMatch(/<iframe[^>]*title="Preview of the Triangle Detailing demo site, Phone width"[^>]*src="\/p\/tok123"/);
    expect(html).toContain('aria-label="Preview width"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Phone<\/button>/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Desktop<\/button>/);
    expect(html).toContain('href="/p/tok123" target="_blank" rel="noreferrer"');
    for (const label of ["Open in new tab", "Copy link", "Email", "Text", "Sent so far", "Failed"]) expect(html).toContain(label);
    expect(html).toContain("TWILIO_ACCOUNT_SID");
    expect(html).toContain('aria-label="Demo site build: Triangle Detailing"');
    expect(unnamedButtons(html)).toEqual([]);
    // Every tap target is 44px tall, or gets 44px on phones via data-jarvis-tap.
    for (const [, attrs] of html.matchAll(/<(?:button|a)\b([^>]*)>/g)) expect(attrs).toMatch(/min-h-11|data-jarvis-tap/);
  });

  it("disables sending once the business claimed it", () => {
    const html = view(status({ status: "completed", claimed: true }));
    expect(html).toContain("Claimed by the business");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Email<\/button>/);
  });

  it("explains a stopped build and an unavailable status in plain language", () => {
    const failed = view(status({ status: "failed", error: "The worker stopped." }));
    expect(failed).toMatch(/role="alert"[^>]*>The worker stopped\./);
    expect(failed).toContain("Check again");
    expect(failed).not.toContain("<iframe");
    const unavailable = view(normalizeDemoStatus({ status: "unavailable", message: "Live build status isn't available on this release yet." }));
    expect(unavailable).toContain("Live build status isn&#x27;t available on this release yet.");
    expect(unavailable).toContain('href="/p/tok123"');
    expect(view(null)).toContain("Checking build status…");
    expect(view(null, { loadError: "Network down" })).toMatch(/role="alert"[^>]*>Couldn&#x27;t check the build: Network down/);
  });
});

const form = (overrides: Partial<Parameters<typeof DemoSendForm>[0]> = {}) => renderToStaticMarkup(
  <DemoSendForm
    channel="email"
    recipient="owner@triangle.example"
    onRecipientChange={noop}
    subject="A free website draft for Triangle Detailing"
    onSubjectChange={noop}
    body="Hi team, here is your draft: https://app.example.com/p/tok123"
    onBodyChange={noop}
    drafting={false}
    draftNote="Written by the free AI pool. Edit anything."
    blocker={null}
    previouslySent={null}
    resend={false}
    onResendChange={noop}
    sending={false}
    error={null}
    onSubmit={noop}
    onCancel={noop}
    {...overrides}
  />,
);
const recipientInput = (html: string) => /<input[^>]*id="demo-send-to"[^>]*>/.exec(html)?.[0] ?? "";
const sendButton = (html: string) => /<button[^>]*type="submit"([^>]*)>/.exec(html)?.[1] ?? "";

describe("demo send sheet", () => {
  it("shows the prefilled recipient, editable subject and AI draft, and enables Send", () => {
    const html = form();
    expect(html).toMatch(/<label[^>]*for="demo-send-to"[^>]*>Email address<\/label>/);
    const to = recipientInput(html);
    expect(to).toContain('type="email"');
    expect(to).toContain('value="owner@triangle.example"');
    expect(html).toContain('id="demo-send-subject"');
    expect(html).toContain("Written by the free AI pool");
    expect(html).toContain("one-click unsubscribe link");
    expect(sendButton(html)).not.toContain("disabled");
    expect(html).toContain("Send email");
    expect(unnamedButtons(html)).toEqual([]);
  });

  it("keeps Send off for a bad recipient, while drafting, or when the mailing address is missing", () => {
    expect(sendButton(form({ recipient: "nope" }))).toContain("disabled");
    expect(form({ recipient: "nope" })).toContain("Enter a full email address.");
    const drafting = form({ drafting: true });
    expect(drafting).toContain("Jarvis is writing the email…");
    expect(sendButton(drafting)).toContain("disabled");
    const blocked = form({ blocker: "Set REVORA_MAILING_ADDRESS before sending." });
    expect(blocked).toMatch(/role="alert"[^>]*>Set REVORA_MAILING_ADDRESS/);
    expect(sendButton(blocked)).toContain("disabled");
  });

  it("needs an explicit resend tick when this channel was already sent", () => {
    const previouslySent = { channel: "email" as const, recipient: "owner@triangle.example", status: "sent" as const, reason: null, mode: "manual" as const, createdAt: "2026-10-19T10:00:00Z" };
    expect(sendButton(form({ previouslySent }))).toContain("disabled");
    expect(form({ previouslySent })).toContain("Send again.");
    expect(sendButton(form({ previouslySent, resend: true }))).not.toContain("disabled");
  });

  it("texts: phone number, STOP note and the plain-language setup error", () => {
    const html = form({ channel: "sms", recipient: "(919) 555-0142", subject: "", body: smsDraft("Triangle Detailing", "https://x.example/p/t"), error: { message: "Texting isn't set up.", help: sendFailureHelp("sms_not_configured") } });
    expect(recipientInput(html)).toContain('type="tel"');
    expect(html).not.toContain('id="demo-send-subject"');
    expect(html).toContain("Reply STOP to opt out.");
    expect(html).toContain("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER");
    expect(html).toContain("Send text");
    expect(sendButton(html)).not.toContain("disabled");
  });

  it("validates recipients and drafts honest texts", () => {
    expect(validRecipient("email", "a@b.co")).toBe(true);
    expect(validRecipient("email", "a@b")).toBe(false);
    expect(validRecipient("sms", "919-555-0142")).toBe(true);
    expect(validRecipient("sms", "555-0142")).toBe(false);
    expect(smsDraft("", "https://x/p/t")).toMatch(/^Hi, /);
    expect(smsDraft("Joe's", "https://x/p/t")).toContain("https://x/p/t");
    expect(sendFailureHelp("something_new")).toBeNull();
  });
});

describe("chat helpers", () => {
  it("reads a demo.send proposal from either shape and rejects anything else", () => {
    expect(readDemoSendProposal({ id: "demo.send", input: { organizationId: ORG, channel: "sms", to: "9195550142" } })).toEqual({ organizationId: ORG, channel: "sms", to: "9195550142" });
    expect(readDemoSendProposal({ id: "demo.send", organizationId: ORG })).toEqual({ organizationId: ORG, channel: "email", to: "" });
    expect(readDemoSendProposal({ id: "demo.send", organizationId: "x" })).toBeNull();
    expect(readDemoSendProposal({ id: "demo.build" })).toBeNull();
  });

  it("spots a pasted Google Maps link", () => {
    expect(findMapsLink("look https://maps.app.goo.gl/AbC123 please")).toBe("https://maps.app.goo.gl/AbC123");
    expect(findMapsLink("https://www.google.com/maps/place/Joe's")).toContain("google.com/maps");
    expect(findMapsLink("https://example.com")).toBeNull();
  });

  it("remembers which demo a chat proposal started, ignoring bad rows", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    rememberDemoCard("m1:0", card, storage);
    store.set("jarvis:demo-cards", JSON.stringify({ ...JSON.parse(store.get("jarvis:demo-cards")!), bad: { organizationId: "nope" } }));
    expect(readDemoCards(storage)).toEqual({ "m1:0": card });
  });
});
