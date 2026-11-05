import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NoticeRepeatDigest } from "./NoticeRepeatDigest";
import { parseEventNotice } from "@/lib/jarvis-event-notice";
import type { NoticeDigestMember } from "@/lib/jarvis-notice-digest";

const notice = parseEventNotice(
  "Heads up [event:ci-failed-triage|Revora Quality Gate]\n\nA CI check failed. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “CI failed.”",
)!;

const members: NoticeDigestMember[] = [
  { id: "a", notice, createdAt: "2026-11-05T12:00:00.000Z" },
  { id: "b", notice: { ...notice, subject: "Gate B" }, createdAt: "2026-11-05T12:10:00.000Z" },
  { id: "c", notice, createdAt: "2026-11-05T12:20:00.000Z" },
];

describe("NoticeRepeatDigest", () => {
  it("draws a collapsed count row without expanding member cards", () => {
    const html = renderToStaticMarkup(<NoticeRepeatDigest members={members} />);
    expect(html).toContain("Release check failed · 3 today");
    expect(html).toContain("Dismiss all 3 notices");
    expect(html).not.toContain("Ask Jarvis to triage");
  });

  it("falls back to a single EventNoticeCard when only one member", () => {
    const html = renderToStaticMarkup(<NoticeRepeatDigest members={[members[0]!]} onAsk={() => undefined} />);
    expect(html).toContain("Ask Jarvis to triage");
    expect(html).not.toContain("· 1 today");
  });
});
