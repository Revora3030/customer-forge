import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("use-stick-to-bottom", () => ({
  StickToBottom: Object.assign(({ children }: { children?: unknown }) => children, { Content: ({ children }: { children?: unknown }) => children }),
  useStickToBottomContext: () => ({ isAtBottom: false, scrollToBottom: () => undefined }),
}));

const { ConversationScrollButton } = await import("./conversation");

describe("ConversationScrollButton accessible name", () => {
  it("has a default name screen readers announce, with the arrow icon hidden", () => {
    const html = renderToStaticMarkup(<ConversationScrollButton />);
    expect(html).toContain('aria-label="Scroll to latest messages"');
    expect(html).toContain('title="Scroll to latest messages"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain('type="button"');
  });

  it("lets a caller override the name (Jarvis uses its own label)", () => {
    const html = renderToStaticMarkup(<ConversationScrollButton aria-label="Jump to latest" />);
    expect(html).toContain('aria-label="Jump to latest"');
    expect(html).not.toContain('aria-label="Scroll to latest messages"');
  });
});
