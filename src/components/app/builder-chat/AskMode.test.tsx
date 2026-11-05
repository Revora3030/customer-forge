import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/builder/ask-mode.functions", () => ({ askAboutSite: async () => ({ answer: "ok", unsure: false, change: null }) }));

import { AskToggle, AskTranscript } from "./AskMode";

describe("Ask mode UI", () => {
  it("the switch defaults to Change and says nothing changes in Ask", () => {
    const off = renderToStaticMarkup(<AskToggle active={false} onChange={() => undefined} />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain("Change");
    const on = renderToStaticMarkup(<AskToggle active onChange={() => undefined} />);
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("nothing on your site changes");
  });

  it("every answered or failed Ask reply shows No changes made; only answers offer Make this change", () => {
    const html = renderToStaticMarkup(
      <AskTranscript
        onMakeChange={() => undefined}
        turns={[
          { id: "a", question: "Do I list hours?", state: "answered", reply: { answer: "Yes, Mon-Fri.", unsure: false, change: null } },
          { id: "b", question: "Broken", state: "failed", error: "Try again." },
          { id: "c", question: "Thinking", state: "thinking" },
        ]}
      />,
    );
    expect(html.match(/data-testid="ask-no-changes"/g)?.length).toBe(2);
    expect(html.match(/data-testid="ask-make-change"/g)?.length).toBe(1);
    expect(html).toContain("Make this change");
  });
});
