import { describe, expect, it } from "vitest";
import { routeChatMessage } from "./agent-run-routing";

describe("routeChatMessage", () => {
  it.each([
    "Send review requests to everyone I served last week",
    "Follow up with the leads who asked for a quote",
    "Who hasn't replied to my quotes?",
    "Remind customers with overdue invoices",
    "Summarize my new leads",
    "Reply to my unanswered reviews",
  ])("sends business work to an agent run: %s", (text) => {
    expect(routeChatMessage(text)).toBe("agent_run");
  });

  it.each([
    "Change the hero headline to something warmer",
    "Add a reviews section to my homepage",
    "Make the website colours darker",
    "Add a contact form to the page",
    "Send me a preview of the site",
    "Hi",
    "Make it better",
    "Fix the footer",
  ])("keeps website and unclear requests on the site path: %s", (text) => {
    expect(routeChatMessage(text)).toBe("site");
  });

  it("keeps attachments, empty and very long text on the site path", () => {
    expect(routeChatMessage("Send review requests to my customers", { hasAttachments: true })).toBe(
      "site",
    );
    expect(routeChatMessage("   ")).toBe("site");
    expect(routeChatMessage("send review requests to customers " + "x".repeat(1600))).toBe("site");
  });
});
