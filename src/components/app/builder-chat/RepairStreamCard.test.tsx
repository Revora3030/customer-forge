import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepairStreamCard } from "./RepairStreamCard";
import type { RepairEvent } from "@/lib/builder/repair-card";

const overflow = "Page overflows sideways at 320 px";
const event: RepairEvent = {
  checked: true,
  before: { score: 80, findings: 1, notes: [overflow] },
  after: { score: 100, findings: 0, notes: [] },
  repaired: [overflow],
  unresolved: [],
  failed: [],
  reported: [],
};

describe("RepairStreamCard", () => {
  it("renders nothing without a repair event", () => {
    expect(
      renderToStaticMarkup(<RepairStreamCard repair={null} onRestore={() => undefined} />),
    ).toBe("");
  });

  it("shows found, fixed and the re-check, with no restore offer when verified", () => {
    const html = renderToStaticMarkup(
      <RepairStreamCard repair={event} onRestore={() => undefined} />,
    );
    expect(html).toContain('data-verdict="verified"');
    expect(html).toContain("Found");
    expect(html).toContain("Fixed and confirmed by the re-check");
    expect(html).toContain(overflow);
    expect(html).toContain("1 issue before, 0 after");
    expect(html).not.toContain("Restore an earlier version");
  });

  it("says when the re-check did not confirm the fix and offers restore", () => {
    const html = renderToStaticMarkup(
      <RepairStreamCard
        repair={{
          ...event,
          repaired: [],
          unresolved: [overflow],
          after: { score: 80, findings: 1, notes: [overflow] },
        }}
        onRestore={() => undefined}
      />,
    );
    expect(html).toContain('data-verdict="recheck_failed"');
    expect(html).toContain("the re-check still finds it");
    expect(html).toContain("Restore an earlier version");
  });
});
