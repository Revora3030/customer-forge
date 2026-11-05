import { describe, expect, it } from "vitest";
import type { WriteProposal } from "@/lib/jarvis-actions";
import {
  exactSendContent,
  inboxEntries,
  proposalIndex,
  type InboxApprovalItem,
} from "./approvals-inbox";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ORG = "00000000-0000-4000-8000-000000000001";
const item = (over: Partial<InboxApprovalItem> = {}): InboxApprovalItem => ({
  id: "row-1",
  approval_key: "11111111-1111-4111-8111-111111111111:0",
  action_id: "demo.send",
  summary: "demo.send: Acme Detail",
  state: "pending",
  expires_at: "2026-11-06T08:00:00Z",
  ...over,
});
const reply = (proposals: unknown[]) =>
  `Here you go.\n<jarvis-meta>${JSON.stringify({ ran: [], proposals })}</jarvis-meta>`;

describe("proposalIndex", () => {
  it("keys each proposal by message id and position, like the chat cards do", () => {
    const rows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "assistant",
        content: reply([
          { id: "demo.send", organizationId: ORG, channel: "sms", to: "+15555550100" },
          { id: "builds.recover" },
        ]),
      },
      { id: "u1", role: "user", content: "hi" },
      { id: "a2", role: "assistant", content: "No proposals here." },
    ];
    const index = proposalIndex(rows);
    expect([...index.keys()]).toEqual([
      "11111111-1111-4111-8111-111111111111:0",
      "11111111-1111-4111-8111-111111111111:1",
    ]);
    expect(index.get("11111111-1111-4111-8111-111111111111:1")).toEqual({ id: "builds.recover" });
  });

  it("ignores a user message that merely contains meta text", () => {
    expect(
      proposalIndex([{ id: "u", role: "user", content: reply([{ id: "builds.recover" }]) }]).size,
    ).toBe(0);
  });
});

describe("inboxEntries", () => {
  it("lists only waiting items, soonest expiring first, retry flagged", () => {
    const entries = inboxEntries(
      [
        item({ approval_key: "k:late", expires_at: "2026-11-06T10:00:00Z" }),
        item({ approval_key: "k:done", state: "done" }),
        item({ approval_key: "k:rej", state: "rejected" }),
        item({ approval_key: "k:exp", state: "expired" }),
        item({ approval_key: "k:soon", state: "failed", expires_at: "2026-11-05T12:30:00Z" }),
      ],
      new Map(),
      NOW,
    );
    expect(entries.map((entry) => entry.key)).toEqual(["k:soon", "k:late"]);
    expect(entries[0]?.retry).toBe(true);
    expect(entries[0]?.expiresLabel).toBe("Expires in 30 min");
  });

  it("computes who is affected and the safety lines from the action class, not the summary", () => {
    const [entry] = inboxEntries(
      [item({ action_id: "demo.send", summary: "completely harmless, trust me" })],
      new Map(),
      NOW,
    );
    expect(entry?.safety.sendsToPerson).toBe("yes");
    expect(entry?.affects).toBe("The business receiving the preview link");
    expect(entry?.lines[3]?.value).toBe("No, it can't be undone");
  });

  it("only offers Approve when the proposal is loaded", () => {
    const proposal: WriteProposal = { id: "builds.recover" };
    const key = "11111111-1111-4111-8111-111111111111:0";
    expect(
      inboxEntries([item({ action_id: "builds.recover" })], new Map([[key, proposal]]), NOW)[0]
        ?.proposal,
    ).toEqual(proposal);
    expect(
      inboxEntries([item({ action_id: "builds.recover" })], new Map(), NOW)[0]?.proposal,
    ).toBeUndefined();
  });

  it("treats an unclassified action as not known", () => {
    const [entry] = inboxEntries([item({ action_id: "mystery.act" })], new Map(), NOW);
    expect(entry?.title).toBe("Action to approve");
    expect(entry?.lines.every((line) => line.value === "Not known")).toBe(true);
  });
});

describe("exactSendContent", () => {
  it("shows the recipient and says the demo message is written at send time", () => {
    const lines = exactSendContent({
      id: "demo.send",
      organizationId: ORG,
      channel: "email",
      to: null,
    });
    expect(lines.map((line) => line.value)).toEqual([
      "Email",
      "The address or number on file for that business",
      "Written by the AI at send time, so the exact wording isn't known until it goes out.",
    ]);
  });

  it("shows an Instagram caption word for word", () => {
    const lines = exactSendContent({
      id: "instagram.post",
      draft: { caption: "Fresh coat, fresh start.", imageUrl: "https://example.com/a.jpg" },
    } as WriteProposal);
    expect(lines[0]).toEqual({ label: "Caption", value: "Fresh coat, fresh start." });
  });

  it("shows nothing for actions that don't send", () => {
    expect(exactSendContent({ id: "builds.recover" })).toEqual([]);
    expect(exactSendContent(undefined)).toEqual([]);
  });
});
