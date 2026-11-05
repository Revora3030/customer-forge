import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_RULES, planEventResponses } from "@/lib/cognition/event-rules";
import { eventMarker } from "@/lib/jarvis-event-watch.server";
import { eventNoticeLabel, parseEventNotice, QUIET_RULES } from "./jarvis-event-notice";

const noticeFor = (proposal: { ruleId: string; subject: string; summary: string; prompt: string }) =>
  `Heads up ${eventMarker(proposal.ruleId, proposal.subject)}\n\n${proposal.summary}\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “${proposal.prompt}”`;

describe("parseEventNotice", () => {
  it("reads back exactly what the event watch posts, for every default rule", () => {
    for (const rule of DEFAULT_EVENT_RULES) {
      const { proposals } = planEventResponses({ events: [{ id: "1", type: rule.on, occurredAt: 1, subject: "Acme", detail: "On commit abc1234." }], rules: [rule], lastProposed: {}, now: 10 * 86_400_000 });
      const proposal = proposals[0]!;
      const parsed = parseEventNotice(noticeFor(proposal));
      expect(parsed, rule.id).not.toBeNull();
      expect(parsed).toMatchObject({ ruleId: rule.id, subject: "Acme", prompt: proposal.prompt });
      expect(parsed!.summary.length).toBeGreaterThan(10);
      expect(parsed!.summary).not.toMatch(/Nothing was changed/);
      expect(parsed!.summary).not.toContain("Send this to Jarvis");
    }
  });

  it("marks Dependabot notices quiet and real CI failures loud", () => {
    expect(QUIET_RULES.has("dependabot-failed-quiet")).toBe(true);
    const { proposals } = planEventResponses({ events: [{ id: "1", type: "ci.dependabot_failed", occurredAt: 1, subject: "Dependabot updates", detail: "3 dependency-update runs failed." }], rules: DEFAULT_EVENT_RULES, lastProposed: {}, now: 9e9 });
    expect(parseEventNotice(noticeFor(proposals[0]!))?.quiet).toBe(true);
    const ci = planEventResponses({ events: [{ id: "2", type: "ci.failed", occurredAt: 1, subject: "Revora Quality Gate" }], rules: DEFAULT_EVENT_RULES, lastProposed: {}, now: 9e9 }).proposals[0]!;
    expect(parseEventNotice(noticeFor(ci))).toMatchObject({ quiet: false, label: "Release check failed" });
  });

  it("handles older notices with no quoted question, and ignores ordinary replies", () => {
    expect(parseEventNotice("Heads up [event:site-down|Site health]\n\nSomething happened. Nothing was changed.")).toMatchObject({ ruleId: "site-down", prompt: null, summary: "Something happened." });
    expect(parseEventNotice("Here is the plan for your site.")).toBeNull();
    expect(parseEventNotice("I said Heads up [event:x|y] mid-sentence")).toBeNull();
  });

  it("labels unknown rules in plain words", () => {
    expect(eventNoticeLabel("some-new-rule")).toBe("Some new rule");
  });
});
