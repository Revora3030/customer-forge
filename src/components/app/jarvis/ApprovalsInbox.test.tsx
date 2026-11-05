import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { inboxEntries } from "@/lib/jarvis/approvals-inbox";
import { jarvisApprovalSafety } from "@/lib/jarvis/approval-safety";
import { ApprovalSafetySummary } from "./ApprovalSafety";
import { InboxCard } from "./ApprovalsInbox";

const KEY = "11111111-1111-4111-8111-111111111111:0";
const send = {
  id: "demo.send" as const,
  organizationId: "00000000-0000-4000-8000-000000000001",
  channel: "sms" as const,
  to: "+15555550100",
};
const entryFor = (withProposal: boolean) =>
  inboxEntries(
    [
      {
        id: "r",
        approval_key: KEY,
        action_id: "demo.send",
        summary: "demo.send: Acme Detail",
        state: "pending",
        expires_at: "2099-01-01T00:00:00Z",
      },
    ],
    new Map(withProposal ? [[KEY, send]] : []),
  )[0]!;

describe("ApprovalSafetySummary", () => {
  it("states all four safety lines", () => {
    const html = renderToStaticMarkup(
      <ApprovalSafetySummary safety={jarvisApprovalSafety("demo.send")} />,
    );
    for (const text of [
      "Sends to a person",
      "Spends money",
      "Changes live data",
      "Can be undone",
      "No, it can&#x27;t be undone",
    ])
      expect(html).toContain(text);
  });
});

describe("InboxCard", () => {
  it("shows what, who is affected, the exact send details and the safety summary with Approve and Reject", () => {
    const html = renderToStaticMarkup(
      <InboxCard
        entry={entryFor(true)}
        busy={false}
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );
    expect(html).toContain("Send a demo link");
    expect(html).toContain("demo.send: Acme Detail");
    expect(html).toContain("Affects: The business receiving the preview link");
    expect(html).toContain("Exactly what goes out");
    expect(html).toContain("+15555550100");
    expect(html).toContain("approval-safety");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).not.toMatch(/reason/i);
  });

  it("disables Approve and points to the conversation when the proposal isn't loaded, but Reject stays on", () => {
    const html = renderToStaticMarkup(
      <InboxCard
        entry={entryFor(false)}
        busy={false}
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );
    expect(html).toContain("Open the conversation this came from to approve it");
    const approve = html.match(/<button[^>]*>Approve<\/button>/)?.[0] ?? "";
    const reject = html.match(/<button[^>]*>Reject<\/button>/)?.[0] ?? "";
    expect(approve).toMatch(/ disabled(=|>)/);
    expect(reject).not.toMatch(/ disabled(=|>)/);
  });

  it("disables both buttons while a decision is in flight", () => {
    const html = renderToStaticMarkup(
      <InboxCard
        entry={entryFor(true)}
        busy
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );
    expect(html.match(/<button[^>]*>Approve<\/button>/)?.[0]).toMatch(/ disabled(=|>)/);
    expect(html.match(/<button[^>]*>Reject<\/button>/)?.[0]).toMatch(/ disabled(=|>)/);
  });
});
