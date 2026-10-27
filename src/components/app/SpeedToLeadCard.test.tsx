import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeedToLeadView } from "./SpeedToLeadCard";

const now = new Date("2026-10-27T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe("SpeedToLeadView", () => {
  it("says there is nothing to measure instead of showing zeros", () => {
    const html = renderToStaticMarkup(<SpeedToLeadView leads={[]} contacts={[]} now={now} />);
    expect(html).toContain("No enquiries in the last 30 days");
    expect(html).not.toContain("Median first reply");
  });

  it("reports measured reply time and the leads still waiting", () => {
    const html = renderToStaticMarkup(
      <SpeedToLeadView
        now={now}
        leads={[
          { id: "a", created_at: ago(120) },
          { id: "b", created_at: ago(90) },
        ]}
        contacts={[{ lead_id: "a", kind: "call", created_at: ago(117) }]}
      />,
    );
    expect(html).toContain("3 min");
    expect(html).toContain("50%");
    expect(html).toContain("1 lead is");
    expect(html).toContain("1 h 30 min");
  });

  it("flags truncated activity rather than implying a full count", () => {
    const html = renderToStaticMarkup(
      <SpeedToLeadView now={now} leads={[{ id: "a", created_at: ago(30) }]} contacts={[]} truncated />,
    );
    expect(html).toContain("most recent activity only");
  });
});
