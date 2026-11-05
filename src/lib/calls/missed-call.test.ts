import { describe, expect, it } from "vitest";

import {
  callSidMarker,
  callStatusUrl,
  dialTwiml,
  displayPhone,
  hangupTwiml,
  isCallSid,
  isMissedDialStatus,
  missedCallTwiml,
  orgIdFromUrl,
  toE164,
} from "./missed-call";

const ORG = "3f2b6c1e-9a4d-4e8b-b1c2-0d9e8f7a6b5c";

describe("missed-call helpers", () => {
  it("treats only unanswered dial results as missed", () => {
    for (const s of ["no-answer", "busy", "failed", "canceled", " NO-ANSWER "]) expect(isMissedDialStatus(s)).toBe(true);
    for (const s of ["completed", "answered", "", null, undefined]) expect(isMissedDialStatus(s)).toBe(false);
  });

  it("reads the organization only from a UUID in the signed URL", () => {
    expect(orgIdFromUrl(`https://app.example/api/public/twilio/voice?org=${ORG}`)).toBe(ORG);
    expect(orgIdFromUrl(`https://app.example/api/public/twilio/voice?org=${ORG.toUpperCase()}`)).toBe(ORG);
    expect(orgIdFromUrl("https://app.example/api/public/twilio/voice?org=1;drop")).toBeNull();
    expect(orgIdFromUrl("https://app.example/api/public/twilio/voice")).toBeNull();
    expect(orgIdFromUrl("not a url")).toBeNull();
  });

  it("normalizes callable numbers and refuses blocked caller ID", () => {
    expect(toE164("+19195550134")).toBe("+19195550134");
    expect(toE164("(919) 555-0134")).toBe("+19195550134");
    expect(toE164("1-919-555-0134")).toBe("+19195550134");
    expect(toE164("+442071838750")).toBe("+442071838750");
    for (const blocked of ["Anonymous", "Restricted", "+266696687", "+86282452253", "", null, "12345"]) {
      expect(toE164(blocked)).toBeNull();
    }
    expect(displayPhone("+19195550134")).toBe("(919) 555-0134");
    expect(displayPhone("+442071838750")).toBe("+442071838750");
  });

  it("dials the owner and posts the result to the signed call-status URL", () => {
    const xml = dialTwiml("+19195550134", callStatusUrl(ORG));
    expect(xml).toContain(`<Dial action="/api/public/twilio/call-status?org=${ORG}" method="POST" timeout="20"`);
    expect(xml).toContain("<Number>+19195550134</Number>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><Response>')).toBe(true);
  });

  it("escapes business names in spoken TwiML and never sends SMS verbs", () => {
    const xml = missedCallTwiml(`Joe's <Plumbing> & Co`);
    expect(xml).toContain("Joe&apos;s &lt;Plumbing&gt; &amp; Co");
    expect(xml).toContain("<Hangup/>");
    for (const t of [xml, hangupTwiml(), dialTwiml("+19195550134", "/x")]) {
      expect(t).not.toMatch(/<Sms|<Message/);
    }
  });

  it("recognizes call SIDs and builds the idempotency marker", () => {
    expect(isCallSid(`CA${"a".repeat(32)}`)).toBe(true);
    expect(isCallSid("CA123")).toBe(false);
    expect(isCallSid(`SM${"a".repeat(32)}`)).toBe(false);
    expect(callSidMarker("CAabc")).toBe("twilio_call_sid:CAabc");
  });
});
