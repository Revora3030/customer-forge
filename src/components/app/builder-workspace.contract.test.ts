import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const shell = readFileSync(new URL("./BuilderShell.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./builder-workspace.css", import.meta.url), "utf8");
describe("builder workspace integration contracts", () => {
  it("uses the shared modal sheet instead of an unmanaged body scroll lock", () => {
    expect(shell).toContain('from "@/components/ui/sheet"');
    expect(shell).toContain("<SheetTrigger asChild>");
    expect(shell).toContain("<SheetTitle>Builder sections</SheetTitle>");
    expect(shell).toContain("<SheetDescription>");
    expect(shell).not.toContain("document.body.style.overflow");
  });
  it("tracks keyboard-visible height and cleans up listeners", () => {
    expect(shell).toContain("window.visualViewport");
    expect(shell).toContain('viewport?.removeEventListener("resize", update)');
    expect(shell).toContain('window.removeEventListener("resize", update)');
    expect(css).toContain("--builder-visual-height");
  });
  it("scopes responsive controls and respects reduced motion", () => {
    expect(shell).toContain('data-revora-builder-workspace="true"');
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(shell).toContain('reduced ? "auto" : "smooth"');
  });
  it("sizes the phone chat from its measured top, with one scroll region", () => {
    expect(css).toContain("calc(var(--builder-visual-height, 100dvh) - var(--builder-chat-top, 12rem))");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain('#website-assistant :is(.builder-prompt button, [data-tap="primary"]) { min-height: 44px; }');
    expect(css).not.toMatch(/#website-assistant button \{ min-height: 44px; \}/);
    const hook = readFileSync(new URL("./builder-chat/use-chat-top.ts", import.meta.url), "utf8");
    expect(hook).toContain('root.style.setProperty("--builder-chat-top"');
    expect(hook).toContain("new ResizeObserver(measure)");
  });
  it("keeps the topbar to one row that only pins from sm up", () => {
    expect(shell).toContain('data-testid="builder-topbar"');
    expect(shell).toContain("sm:sticky");
    expect(shell).not.toMatch(/builder-project-actions"[^>]*w-full/);
    expect(shell).toContain('className="hidden items-center gap-0.5 sm:flex"');
  });
  it("restores truncation and line clamps inside the builder", () => {
    expect(css).toContain(".product-canvas [data-revora-builder-workspace] .truncate");
    expect(css).toContain("-webkit-line-clamp: 2");
  });
});
