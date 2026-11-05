import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuietNoticesDigest } from "./QuietNoticesDigest";
import { parseEventNotice } from "@/lib/jarvis-event-notice";

const BOT = parseEventNotice("Heads up [event:dependabot-failed-quiet|Dependabot updates]\n\nDependabot's dependency-update job failed: 3 runs. Nothing was changed.\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “Dependabot runs failed.”")!;

describe("QuietNoticesDigest", () => {
  it("renders a collapsible N quiet notices row for multiple quiet events", () => {
    const html = renderToStaticMarkup(
      <QuietNoticesDigest
        rows={[
          { id: "a", notice: BOT, createdAt: "2026-11-05T06:00:00Z" },
          { id: "b", notice: { ...BOT, subject: "Other" }, createdAt: "2026-11-05T06:01:00Z" },
        ]}
      />,
    );
    expect(html).toContain("2 quiet notices");
    expect(html).toContain('aria-expanded="false"');
    // Collapsed: individual triage buttons are not shown until expand (SSR default closed).
    expect(html).not.toContain("Ask Jarvis anyway");
  });
});
