import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/app/jarvis/OperationsPanel.tsx", "utf8");

describe("JC-50 operations command board", () => {
  it("exposes the four command tabs and remembers the open tab on this device", () => {
    expect(panel).toContain('id: "now"');
    expect(panel).toContain('id: "waiting"');
    expect(panel).toContain('id: "money"');
    expect(panel).toContain('id: "health"');
    expect(panel).toContain("revora.ops-command-board.tab");
    expect(panel).toContain("revora.ops-command-board.open");
    expect(panel).toContain("min-h-[28rem]");
  });

  it("keeps the lead import card and links sections to city districts", () => {
    expect(panel).toContain("<ProspectLeadImportCard />");
    expect(panel).toContain("<StatsTrends />");
    expect(panel).toContain('district="factory"');
    expect(panel).toContain('district="growth"');
    expect(panel).toContain('district="security"');
    expect(panel).toContain('district="institute"');
    expect(panel).toContain('district="executive"');
    expect(panel).toContain("<RevenueCard enabled />");
  });
});
