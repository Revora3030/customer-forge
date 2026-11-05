import { describe, expect, it } from "vitest";
import {
  argumentLines,
  expiresLabel,
  pendingApprovals,
  toolLabel,
  viewApproval,
} from "./approvals-view";
import type { ApprovalRow } from "./approvals.server";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const row = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: "id-1",
  organization_id: "org-1",
  scope: "owner",
  run_id: null,
  step_id: null,
  requested_by: null,
  tool: "send_sms",
  args: { to: "Dana Reyes", body: "Your quote is ready." },
  args_hash: "a".repeat(64),
  summary: "Text Dana Reyes: your quote is ready.",
  status: "pending",
  created_at: "2026-11-05T11:00:00Z",
  expires_at: "2026-11-06T11:00:00Z",
  decided_by: null,
  decided_at: null,
  consumed_at: null,
  ...over,
});

describe("approval view", () => {
  it("labels known tools plainly and unknown ones readably", () => {
    expect(toolLabel("send_sms")).toBe("Send a text message");
    expect(toolLabel("update_listing_hours")).toBe("Update listing hours");
  });

  it("shows the exact arguments and never a secret value", () => {
    const { lines } = argumentLines({
      to: "Dana",
      apiKey: "sk-live-123",
      authToken: "abc",
      subject: "Hi",
    });
    expect(lines.find((l) => l.label === "Api Key")?.value).toBe("(hidden)");
    expect(lines.find((l) => l.label === "Auth Token")?.value).toBe("(hidden)");
    expect(lines.find((l) => l.label === "To")?.value).toBe("Dana");
    expect(JSON.stringify(lines)).not.toContain("sk-live-123");
  });

  it("caps lines and long values, and says how many are hidden", () => {
    const args = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`k${i}`, "x".repeat(500)]),
    );
    const { lines, hidden } = argumentLines(args);
    expect(lines).toHaveLength(8);
    expect(hidden).toBe(3);
    expect(lines[0]!.value.length).toBeLessThanOrEqual(240);
  });

  it("counts time left honestly", () => {
    expect(expiresLabel("2026-11-05T12:30:00Z", NOW)).toBe("30 min left");
    expect(expiresLabel("2026-11-06T11:00:00Z", NOW)).toBe("23 h left");
    expect(expiresLabel("2026-11-05T11:59:59Z", NOW)).toBe("expired");
    expect(expiresLabel("not a date", NOW)).toBe("expired");
  });

  it("lists only live, waiting approvals, newest first", () => {
    const list = pendingApprovals(
      [
        row({ id: "old", created_at: "2026-11-05T09:00:00Z" }),
        row({ id: "new", created_at: "2026-11-05T11:30:00Z" }),
        row({ id: "done", status: "approved" }),
        row({ id: "stale", expires_at: "2026-11-05T11:00:00Z" }),
        row({ id: "no", status: "rejected" }),
      ],
      NOW,
    );
    expect(list.map((x) => x.id)).toEqual(["new", "old"]);
    expect(list.every((x) => x.waiting)).toBe(true);
  });

  it("a pending row past its expiry reads as expired, not waiting", () => {
    const v = viewApproval(row({ expires_at: "2026-11-05T11:00:00Z" }), NOW);
    expect(v.waiting).toBe(false);
    expect(v.statusLabel).toBe("Expired");
  });
});
