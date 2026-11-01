import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventNoticeCard } from "./EventNoticeCard";
import { parseEventNotice } from "@/lib/jarvis-event-notice";

const CI = parseEventNotice("Heads up [event:ci-failed-triage|Revora Quality Gate]\n\nA CI check failed on the release branch: Revora Quality Gate. On commit abc1234. https://github.com/Revora3030/customer-forge/actions/runs/42 Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “CI failed on Revora Quality Gate. Read the failing check.”")!;
const BOT = parseEventNotice("Heads up [event:dependabot-failed-quiet|Dependabot updates]\n\nDependabot's dependency-update job failed: 3 dependency-update runs failed on commit abc1234. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “Dependabot runs failed.”")!;

describe("EventNoticeCard", () => {
  it("draws a CI failure as a compact card with a one-tap triage button and no raw tags", () => {
    const html = renderToStaticMarkup(<EventNoticeCard id="m1" notice={CI} onAsk={() => undefined} />);
    expect(html).toContain("Ask Jarvis to triage");
    expect(html).toContain("Release check failed");
    expect(html).toContain("Revora Quality Gate");
    expect(html).toContain("Open the run");
    expect(html).not.toContain("[event:");
    expect(html).not.toContain("Send this to Jarvis");
  });

  it("draws Dependabot noise as one muted line", () => {
    const html = renderToStaticMarkup(<EventNoticeCard id="m2" notice={BOT} onAsk={() => undefined} />);
    expect(html).toContain("Dependabot update failed");
    expect(html).toContain("Ask Jarvis anyway");
    expect(html).not.toContain("Ask Jarvis to triage");
    expect(html).not.toContain("uppercase");
  });

  it("offers no triage button when there is no question to send", () => {
    expect(renderToStaticMarkup(<EventNoticeCard id="m3" notice={{ ...CI, prompt: null }} onAsk={() => undefined} />)).not.toContain("Ask Jarvis");
    expect(renderToStaticMarkup(<EventNoticeCard id="m4" notice={CI} />)).not.toContain("Ask Jarvis");
  });
});
