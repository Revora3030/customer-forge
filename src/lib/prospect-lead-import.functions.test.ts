import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const functions = readFileSync("src/lib/prospect-lead-import.functions.ts", "utf8");
const card = readFileSync("src/components/app/jarvis/ProspectLeadImportCard.tsx", "utf8");
const panel = readFileSync("src/components/app/jarvis/OperationsPanel.tsx", "utf8");

describe("the lead import server functions", () => {
  it("load server code only inside a handler, so none of it reaches the browser", () => {
    expect(functions).not.toMatch(/^import[^;]*\.server/m);
    expect(functions.match(/await import\("\.\/prospect-lead-import\.server"\)/g)).toHaveLength(3);
  });

  it("are for super-admins only: every handler checks that before touching a lead", () => {
    expect(functions.match(/await guardedAdmin\(context\)/g)).toHaveLength(3);
    expect(functions).toContain("assertSuperAdmin");
  });
});

describe("the Import leads card", () => {
  it("is on the Jarvis operations panel", () => {
    expect(panel).toContain("<ProspectLeadImportCard />");
  });

  it("says nothing is contacted, takes no credentials and shows lead text as plain text", () => {
    expect(card).toContain("nothing is contacted");
    expect(card).toContain("Nothing is sent from this page");
    expect(card).not.toMatch(/type="password"|dangerouslySetInnerHTML|innerHTML/);
  });

  it("approves and rejects only what the owner ticked", () => {
    expect(card).toContain("ids: [...selected]");
    expect(card).toContain('review.mutate("approve")');
    expect(card).toContain('review.mutate("reject")');
  });
});
