import { describe, expect, it } from "vitest";
import { alertInbox, alertRecipient } from "./lead-alert-recipient";
import { alertRecipient as reExported } from "./notifications.functions";

describe("lead alert recipient", () => {
  it("prefers notification_email, then email, then owner_email", () => {
    const all = {
      notification_email: "alerts@acme.test",
      email: "hello@acme.test",
      owner_email: "owner@acme.test",
    };
    expect(alertRecipient(all)).toBe("alerts@acme.test");
    expect(alertRecipient({ ...all, notification_email: null })).toBe("hello@acme.test");
    expect(alertRecipient({ ...all, notification_email: null, email: "" })).toBe("owner@acme.test");
  });

  it("skips anything that is not a valid address and trims whitespace", () => {
    expect(alertRecipient({ notification_email: "nope", email: " hello@acme.test " })).toBe(
      "hello@acme.test",
    );
    expect(alertRecipient({ email: "a@b" })).toBeNull();
    expect(alertRecipient({ email: "a b@acme.test" })).toBeNull();
    expect(alertRecipient({})).toBeNull();
  });

  it("honours notify_on_lead, while alertInbox still names the inbox", () => {
    expect(alertRecipient({ email: "hello@acme.test", notify_on_lead: false })).toBeNull();
    expect(alertRecipient({ email: "hello@acme.test", notify_on_lead: null })).toBe("hello@acme.test");
    expect(alertInbox({ email: "hello@acme.test", notify_on_lead: false })).toBe("hello@acme.test");
  });

  it("is the same function the server functions export", () => {
    expect(reExported).toBe(alertRecipient);
  });
});
