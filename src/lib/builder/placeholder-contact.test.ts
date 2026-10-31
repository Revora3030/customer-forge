import { describe, expect, it } from "vitest";
import { businessFacts } from "./facts";
import { isPlaceholderEmail, isPlaceholderPhone, phoneDisplay, phoneLink, emailDisplay, emailLink } from "./presentation";
import { scrubPlaceholderContact, scrubPlaceholderText } from "./placeholder-contact";
import { stickyActions } from "@/components/site/site-sections-utils";

const FAKE_PHONES = ["(555) 123-4567", "555-1212", "555.123.4567", "+1 (555) 010-0199", "1-555-123-4567", "5551234567", "(512) 555-0142", "555 0142"];
const FAKE_EMAILS = ["owner@example.com", "hello@elite.example", "a@biz.test", "x@mail.example.org", "me@site.invalid", "me@localhost"]; // DevSkim: ignore DS162092 -- Test data: placeholder emails that must be withheld; no host is accessed.

describe("placeholder contact details are withheld at render (audit P1-04)", () => {
  it("recognises 555 phones in any format and example/test emails", () => {
    for (const phone of FAKE_PHONES) expect(isPlaceholderPhone(phone), phone).toBe(true);
    for (const email of FAKE_EMAILS) expect(isPlaceholderEmail(email), email).toBe(true);
    // Real numbers and addresses are never flagged.
    expect(isPlaceholderPhone("(919) 555-2368")).toBe(false);
    expect(isPlaceholderPhone("(919) 482-7731")).toBe(false);
    expect(isPlaceholderEmail("owner@realbiz.com")).toBe(false);
  });

  it("businessFacts, the footer's source, returns no phone or email for them", () => {
    for (const phone of FAKE_PHONES) {
      expect(phoneDisplay(phone), phone).toBeNull();
      expect(phoneLink(phone), phone).toBeNull();
      const facts = businessFacts({ phone }, "Elite Mobile Detailing");
      expect(facts.phone).toBeNull();
      expect(facts.phoneHref).toBeNull();
    }
    for (const email of FAKE_EMAILS) {
      expect(emailDisplay(email), email).toBeNull();
      expect(emailLink(email), email).toBeNull();
      const facts = businessFacts({ email }, "Elite Mobile Detailing");
      expect(facts.email).toBeNull();
      expect(facts.emailHref).toBeNull();
    }
    const real = businessFacts({ phone: "(919) 482-7731", email: "owner@realbiz.com" }, "Real Biz");
    expect(real.phone).toBe("(919) 482-7731");
    expect(real.email).toBe("owner@realbiz.com");
  });

  it("the phone-only sticky bar offers no Call button for a placeholder number", () => {
    expect(stickyActions({ phone: "(555) 123-4567" }).some((a) => a.kind === "call")).toBe(false);
    expect(stickyActions({ phone: "(919) 482-7731" }).some((a) => a.kind === "call")).toBe(true);
  });

  it("scrubs placeholder phones and emails out of stored page text", () => {
    expect(scrubPlaceholderText("Open 8 to 5. Call (555) 123-4567")).toBe("Open 8 to 5.");
    expect(scrubPlaceholderText("Call (555) 123-4567")).toBe("");
    expect(scrubPlaceholderText("Email hello@elite.example or visit us")).toBe("visit us");
    // Real contact details and ordinary numbers are untouched.
    expect(scrubPlaceholderText("Call (919) 482-7731")).toBe("Call (919) 482-7731");
    expect(scrubPlaceholderText("Serving Raleigh since 2010-2020, 24 services")).toBe("Serving Raleigh since 2010-2020, 24 services");
  });

  it("scrubs a whole stored tree: text, tel:/mailto: links and list items", () => {
    const tree = {
      id: "11111111-2222-3333-4444-555555555555",
      root: {
        type: "stack",
        children: [
          { type: "text", text: "Questions? Call (555) 123-4567 or email hello@elite.example." },
          { type: "link", text: "(555) 123-4567", href: "tel:5551234567" },
          { type: "button", text: "Email us", href: "mailto:hello@elite.example" },
          { type: "link", text: "Call (919) 482-7731", href: "tel:+19194827731" },
          { type: "list", items: ["Phone: 555-1212", "Free estimates"] },
        ],
      },
    };
    const out = scrubPlaceholderContact(tree, "#contact");
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/555-?1212|555\) 123|5551234567|elite\.example/);
    expect(out.id).toBe(tree.id);
    const kids = out.root.children as { text?: string; href?: string; items?: string[] }[];
    expect(kids[0]?.text).toBe("Questions?");
    expect(kids[1]).toMatchObject({ text: "Contact us", href: "#contact" });
    expect(kids[2]).toMatchObject({ text: "Email us", href: "#contact" });
    expect(kids[3]).toMatchObject({ text: "Call (919) 482-7731", href: "tel:+19194827731" });
    expect(kids[4]?.items).toEqual(["Free estimates"]);
  });
});
