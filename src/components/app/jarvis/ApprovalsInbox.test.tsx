import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { inboxEntries } from "@/lib/jarvis/approvals-inbox";
import {
  approvalSafety,
  isBulkApproveEligible,
  jarvisApprovalSafety,
} from "@/lib/jarvis/approval-safety";
import type { WriteProposal } from "@/lib/jarvis-actions";
import { ApprovalSafetySummary } from "./ApprovalSafety";
import { bulkApproveEligibleEntries } from "@/lib/jarvis/approvals-inbox";
import { ApprovalsQueue, InboxCard } from "./ApprovalsQueue";

const KEY = "11111111-1111-4111-8111-111111111111:0";
const KEY2 = "22222222-2222-4222-8222-222222222222:0";
const KEY3 = "33333333-3333-4333-8333-333333333333:0";

const send = {
  id: "demo.send" as const,
  organizationId: "00000000-0000-4000-8000-000000000001",
  channel: "sms" as const,
  to: "+15555550100",
};
const codePr: WriteProposal = {
  id: "code.pr",
  pr: {
    title: "Fix lint in approvals",
    summary: "Tighten the approval card types so the inbox compiles cleanly.",
    changes: [{ path: "src/lib/x.ts", content: "export {}" }],
  },
};
const research = {
  id: "research.ask" as const,
  question: "What is Revora?",
  preset: "fast" as const,
} as WriteProposal;

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

const multiEntries = () =>
  inboxEntries(
    [
      {
        id: "a",
        approval_key: KEY,
        action_id: "demo.send",
        summary: "demo.send: Acme",
        state: "pending",
        expires_at: "2099-01-01T00:00:00Z",
      },
      {
        id: "b",
        approval_key: KEY2,
        action_id: "code.pr",
        summary: "code.pr: Fix lint",
        state: "pending",
        expires_at: "2099-01-02T00:00:00Z",
      },
      {
        id: "c",
        approval_key: KEY3,
        action_id: "research.ask",
        summary: "research.ask: What is Revora?",
        state: "pending",
        expires_at: "2099-01-03T00:00:00Z",
      },
    ],
    new Map<string, WriteProposal>([
      [KEY, send],
      [KEY2, codePr],
      [KEY3, research],
    ]),
  );

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

describe("InboxCard (shared ApprovalsQueue card)", () => {
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

describe("isBulkApproveEligible (JC-55 / NB4 hard gate)", () => {
  it("allows only explicit undoable Yes + sends No + spends No", () => {
    expect(isBulkApproveEligible(approvalSafety("code.pr"))).toBe(true);
    expect(isBulkApproveEligible(approvalSafety("routine.create"))).toBe(true);
    expect(isBulkApproveEligible(approvalSafety("routine.update"))).toBe(true);
  });

  it("fails closed on sends, spends, unknown, or non-Yes undo", () => {
    expect(isBulkApproveEligible(approvalSafety("demo.send"))).toBe(false);
    expect(isBulkApproveEligible(approvalSafety("research.ask"))).toBe(false); // Nothing to undo
    expect(isBulkApproveEligible(approvalSafety("claude.code"))).toBe(false); // spends unknown
    expect(isBulkApproveEligible(approvalSafety("autopilot.configure"))).toBe(false); // spends unknown
    expect(isBulkApproveEligible(approvalSafety("autopilot.run"))).toBe(false);
    expect(isBulkApproveEligible(approvalSafety("memory.forget"))).toBe(false);
    expect(isBulkApproveEligible(approvalSafety("totally.new"))).toBe(false); // Not known
  });
});

describe("ApprovalsQueue bulk toolbar (JC-55)", () => {
  it("offers bulk approve only for gate-passing entries with proposals", () => {
    const entries = multiEntries();
    const eligible = bulkApproveEligibleEntries(entries);
    expect(eligible.map((e) => e.actionId)).toEqual(["code.pr"]);
    const html = renderToStaticMarkup(
      <ApprovalsQueue
        entries={entries}
        busyKey={null}
        onApprove={() => undefined}
        onReject={() => undefined}
        onBulkApprove={() => undefined}
        onBulkReject={() => undefined}
      />,
    );
    expect(html).toContain("bulk-approve");
    expect(html).toContain("Approve all safe (1)");
    expect(html).toContain("Reject all 3");
    expect(html).toContain("Open a pull request");
    expect(html).toContain("Send a demo link");
  });

  it("disables bulk approve when nothing is eligible", () => {
    const onlySend = [entryFor(true)];
    const html = renderToStaticMarkup(
      <ApprovalsQueue
        entries={[onlySend[0]!, { ...onlySend[0]!, key: KEY2, actionId: "demo.send", title: "Send 2" }]}
        busyKey={null}
        onApprove={() => undefined}
        onReject={() => undefined}
        onBulkApprove={() => undefined}
        onBulkReject={() => undefined}
      />,
    );
    const bulk = html.match(/<button[^>]*data-testid="bulk-approve"[^>]*>/)?.[0]
      ?? html.match(/<button[^>]*disabled[^>]*data-testid="bulk-approve"[^>]*>/)?.[0]
      ?? "";
    expect(bulk).toMatch(/\bdisabled(=|"|\s|>)/);
    expect(html).toContain("Approve all safe");
    expect(html).toContain("None of these are safe to bulk-approve");
  });

  it("hides bulk approve when the host omits onBulkApprove (admin page reject-only)", () => {
    const html = renderToStaticMarkup(
      <ApprovalsQueue
        entries={multiEntries()}
        busyKey={null}
        onApprove={() => undefined}
        onReject={() => undefined}
        onBulkReject={() => undefined}
      />,
    );
    expect(html).toContain("bulk-reject");
    expect(html).not.toContain("bulk-approve");
  });
});
