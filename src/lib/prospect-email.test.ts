import { describe, expect, it } from "vitest";
import { decodeEmailText, deobfuscateEmailText, extractBusinessEmail, extractMetaEmail } from "./prospect-email";

describe("public email extraction", () => {
  it("prefers a listed mailto contact and normalizes it", () => {
    expect(extractBusinessEmail('<a href="mailto:Joe@JoesDetail.com">Email</a>')).toBe("joe@joesdetail.com");
  });

  it("ignores platform/system emails rather than treating them as the business contact", () => {
    expect(extractBusinessEmail("contact privacy@facebook.com or noreply@shop.com")).toBeNull();
    expect(extractBusinessEmail("support@shop.com")).toBeNull();
  });

  it("ignores placeholders and file-like addresses", () => {
    expect(extractBusinessEmail("team@example.com logo@shop.com.png")).toBeNull();
  });

  it("decodes common at-sign encodings", () => {
    expect(extractBusinessEmail("owner&#64;shine-detailing.com")).toBe("owner@shine-detailing.com");
    expect(extractBusinessEmail("owner%40shine-detailing.com")).toBe("owner@shine-detailing.com");
  });

  it("decodes numeric entities for @ and . in visible text and mailto links", () => {
    expect(extractBusinessEmail("owner&#x40;shine-detailing&#46;com")).toBe("owner@shine-detailing.com");
    expect(extractBusinessEmail("owner&#X40;shine-detailing&#x2E;com")).toBe("owner@shine-detailing.com");
    expect(extractBusinessEmail("owner&commat;shine-detailing&period;com")).toBe("owner@shine-detailing.com");
    expect(extractBusinessEmail('<a href="mailto:owner&#64;shine-detailing.com">Email</a>')).toBe("owner@shine-detailing.com");
    expect(extractBusinessEmail('<a href="mailto:owner%40shine-detailing.com?subject=hi">Email</a>')).toBe("owner@shine-detailing.com");
  });

  it("decodes entities in one pass, never twice", () => {
    expect(decodeEmailText("&amp;#64;")).toBe("&#64;");
    expect(decodeEmailText("&amp;lt;")).toBe("&lt;");
    expect(extractBusinessEmail("owner&amp;#64;shine-detailing.com")).toBeNull();
    // Non-ASCII or control code points are left as written.
    expect(decodeEmailText("&#0;&#x1F600;&#9999999;")).toBe("&#0;&#x1F600;&#9999999;");
  });

  it("decodes bracketed at/dot spellings, case-insensitive and with inner spaces", () => {
    for (const text of [
      "owner (at) shine-detailing (dot) com",
      "owner{at}shine-detailing{dot}com",
      "owner [AT] shine-detailing [Dot] com",
      "owner [ at ] shine-detailing ( dot ) com",
      "<p>Email: owner(at)shine-detailing(dot)com</p>",
      '<a href="mailto:owner[at]shine-detailing[dot]com">Email</a>',
    ])
      expect(extractBusinessEmail(text), text).toBe("owner@shine-detailing.com");
    // Bracketed spellings inside meta tags are left to extractMetaEmail.
    expect(extractBusinessEmail('<meta name="keywords" content="joe [at] joesplumbing [dot] com">')).toBeNull();
  });

  it("never turns bare prose at/dot into an address", () => {
    for (const text of [
      "call us at 5",
      "meet at the shop dot com",
      "owner at shine-detailing dot com",
      "owner (at shine-detailing dot com)",
      "owner [at) shine-detailing (dot] com",
    ])
      expect(extractBusinessEmail(text), text).toBeNull();
    expect(deobfuscateEmailText("meet at the shop dot com")).toBe("meet at the shop dot com");
    expect(extractMetaEmail('<meta name="description" content="Call us at 5 or meet at the shop dot com">')).toBeNull();
  });

  it("decodes entity and bracketed spellings in meta tags once", () => {
    expect(extractMetaEmail('<meta property="og:description" content="Email owner&#64;shine-detailing&#46;com">')).toBe("owner@shine-detailing.com");
    expect(extractMetaEmail('<meta property="og:description" content="owner {at} shine-detailing {dot} com">')).toBe("owner@shine-detailing.com");
    expect(extractMetaEmail('<meta property="og:description" content="owner&amp;#64;shine-detailing.com">')).toBeNull();
  });

  it("rejects contacts longer than the validated business-profile field", () => {
    const local = "a".repeat(170);
    expect(extractBusinessEmail(local + "@shine-detailing.com")).toBeNull();
  });

  it("returns null when the page does not list a business email", () => {
    expect(extractBusinessEmail("<p>Call us today</p>")).toBeNull();
  });
});

it("decodes bracketed spellings in linear time on whitespace-heavy pages", () => {
  const started = Date.now();
  deobfuscateEmailText(`${" ".repeat(80_000)}x`);
  expect(Date.now() - started).toBeLessThan(500);
  expect(deobfuscateEmailText("owner (at) shop [dot] com")).toBe("owner@shop.com");
});
