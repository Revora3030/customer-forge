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
});
