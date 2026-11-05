import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, hash, children, ...rest }: { to: string; hash?: string; children: unknown } & Record<string, unknown>) => (
    <a href={`${to}#${hash ?? ""}`} {...(rest as object)}>{children as never}</a>
  ),
}));

import { AgentRunFeedView, UsedNoteChips } from "./AgentRunFeed";
import type { RunFeed } from "@/lib/builder/agent-run-feed";

const feed = (memory: RunFeed["memory"]): RunFeed => ({ state: "done", headline: "Finished", detail: null, lines: [], memory });

describe("used-note chips", () => {
  it("renders one Used chip per recalled note and flags unconfirmed ones", () => {
    const html = renderToStaticMarkup(
      <AgentRunFeedView
        feed={feed([
          { id: "a", key: "Opening hours", confirmed: true, source: "You told us this" },
          { id: "b", key: "Service area", confirmed: false, source: "" },
        ])}
      />,
    );
    expect(html).toContain("Used:");
    expect(html).toContain("Opening hours");
    expect(html).toContain("Service area");
    expect(html).toContain("(not confirmed)");
    expect(html.match(/\(not confirmed\)/g)).toHaveLength(1);
    expect(html).toContain('href="/app/settings#memory-manager"');
    expect(html).toContain("You told us this");
  });

  it("shows no chips when nothing was recalled", () => {
    const html = renderToStaticMarkup(<AgentRunFeedView feed={feed([])} />);
    expect(html).not.toContain("used-note-chips");
    expect(html).not.toContain("Used:");
  });

  it("escapes note text", () => {
    const html = renderToStaticMarkup(<UsedNoteChips notes={[{ id: "x", key: "<img src=x onerror=1>", confirmed: true, source: "" }]} />);
    expect(html).not.toContain("<img");
  });
});
