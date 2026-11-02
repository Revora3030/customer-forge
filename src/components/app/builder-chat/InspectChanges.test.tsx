import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplyResultCard } from "./ApplyResultCard";
import { InspectChangesView } from "./InspectChanges";
import { snapshotFromVersionPages, type ApplyDiffRow } from "@/lib/builder/apply-diff";

const row: ApplyDiffRow = {
  where: "Home › hero · Welcome",
  field: "heading",
  before: "Old headline",
  after: "New headline",
  change: "changed",
  format: "text",
};

describe("InspectChangesView", () => {
  it("shows red before and green after rows, and a copy button", () => {
    const html = renderToStaticMarkup(<InspectChangesView state="ready" rows={[row]} onCopy={() => undefined} />);
    expect(html).toContain("Old headline");
    expect(html).toContain("New headline");
    expect(html).toContain("text-red-200");
    expect(html).toContain("text-emerald-200");
    expect(html).toContain("Copy changes");
    expect(html).toContain("Before: ");
  });

  it("says so honestly when there is nothing to compare or nothing differs", () => {
    expect(renderToStaticMarkup(<InspectChangesView state="no-restore-point" rows={[]} />)).toContain("isn&#x27;t available");
    expect(renderToStaticMarkup(<InspectChangesView state="ready" rows={[]} />)).toContain("No differences");
    expect(renderToStaticMarkup(<InspectChangesView state="error" rows={[]} />)).toContain("Couldn&#x27;t load");
  });
});

describe("restore point shapes", () => {
  it("reads both stored shapes and rejects others", () => {
    const full = { format: 1, takenAt: "t", pages: [] };
    expect(snapshotFromVersionPages(full)?.format).toBe(1);
    expect(snapshotFromVersionPages({ full })?.format).toBe(1);
    expect(snapshotFromVersionPages({ content: { pages: [] } })).toBeNull();
    expect(snapshotFromVersionPages(null)).toBeNull();
  });
});

describe("ApplyResultCard inspect slot", () => {
  it("renders the slot after the change list, and nothing without it", () => {
    expect(renderToStaticMarkup(<ApplyResultCard applied={1} inspect={<p>SLOT</p>} />)).toContain("SLOT");
    expect(renderToStaticMarkup(<ApplyResultCard applied={1} />)).not.toContain("Inspect");
  });
});
