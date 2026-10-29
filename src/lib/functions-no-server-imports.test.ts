import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A `.functions.ts` file is bundled for the browser too. TanStack Start strips
 * code used only inside a server function's handler, but a helper exported from
 * the same file that touches a server-only import keeps that import in the page.
 * stored-config.server uses AsyncLocalStorage, which does not exist in the
 * browser, so /admin/jarvis showed "This page didn't load" until the footer helper
 * moved to outreach-footer.server.ts.
 */
describe("the Jarvis prospecting functions file stays safe for the browser", () => {
  const source = readFileSync("src/lib/jarvis-prospecting.functions.ts", "utf8");

  it("does not import the Gmail stored-config module", () => {
    expect(source).not.toMatch(/stored-config\.server/);
  });

  it("loads the footer helper only inside a handler", () => {
    expect(source).not.toMatch(/^import[^;]*outreach-footer\.server/m);
    expect(source).toMatch(/await import\("\.\/outreach-footer\.server"\)/);
  });

  it("keeps the AsyncLocalStorage module out of every client-reachable functions file", () => {
    const footer = readFileSync("src/lib/outreach-footer.server.ts", "utf8");
    expect(footer).toMatch(/stored-config\.server/);
  });
});
