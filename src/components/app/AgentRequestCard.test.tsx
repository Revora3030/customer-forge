import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentRequestCard } from "@/components/app/AgentRequestCard";
import { needsSecondTap } from "@/lib/agent-authority";
import type { ActionRequestView } from "@/lib/agent-gateway";

const sampleRequest = (extra: Partial<ActionRequestView> = {}): ActionRequestView => ({
  id: "00000000-0000-4000-8000-000000000001",
  kind: "merge_pull_request",
  label: "Merge a pull request into lovable-sync",
  title: "Merge #412: booking form keeps the chosen time",
  detail: "The booking form forgot the time slot after a validation error.",
  target_url: "https://github.com/Revora3030/customer-forge/pull/412",
  payload: { pr: 412 },
  evidence: {
    task_id: "PR-412",
    affected_files: ["src/components/site/BookingForm.tsx", "src/components/site/BookingForm.test.tsx"],
    tests: { passed: 4047, failed: 0, command: "npx vitest run" },
    typecheck: "passed",
    build: "passed",
    rollback: "Revert the merge commit on lovable-sync.",
  },
  requested_by: "grok",
  idempotency_key: "grok-pr-412-v1",
  status: "pending",
  state: "pending",
  created_at: "2026-10-30T12:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
  decided_at: null,
  decision_note: null,
  completed_at: null,
  result_url: null,
  result_note: null,
  ...extra,
});

const html = (item: ActionRequestView) => renderToStaticMarkup(<AgentRequestCard item={item} focused={false} busy={false} onDecide={() => undefined} />);

describe("AgentRequestCard", () => {
  it("shows Approve and Reject only while the request waits", () => {
    expect(html(sampleRequest())).toMatch(/Approve/);
    expect(html(sampleRequest())).toMatch(/Reject/);
    const done = html(sampleRequest({ status: "completed", state: "completed" }));
    expect(done).not.toMatch(/>\s*Approve/);
    expect(done).toMatch(/Done/);
  });

  it("shows the evidence and warns when the bot's own checks failed", () => {
    expect(html(sampleRequest())).toMatch(/4047 passed, 0 failed/);
    const failing = sampleRequest({ evidence: { ...sampleRequest().evidence!, tests: { passed: 10, failed: 2 } } });
    expect(html(failing)).toMatch(/checks failed/);
  });

  it("asks for a second tap on actions that can't be undone", () => {
    expect(needsSecondTap("delete_customer_data")).toBe(true);
    expect(needsSecondTap("send_outreach")).toBe(true);
    expect(needsSecondTap("merge_pull_request")).toBe(false);
  });

  it("uses thumb-sized buttons", () => {
    expect(html(sampleRequest())).toMatch(/min-h-12/);
  });
});
