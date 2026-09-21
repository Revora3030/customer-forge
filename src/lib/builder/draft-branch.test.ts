import { describe, expect, it } from "vitest";
import {
  branchChange,
  branchIsUnchanged,
  canStartBranch,
  describeBranchChange,
  normaliseBranchLabel,
  publishBlockReason,
  readBranchChange,
  type DraftBranch,
} from "@/lib/builder/draft-branch";
import { buildFullSnapshot } from "@/lib/site-restore";

const page = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  title: `Page ${id}`,
  kind: "page",
  sort_order: 0,
  is_visible: true,
  ...extra,
});

const section = (id: string, pageId: string, extra: Record<string, unknown> = {}) => ({
  id,
  page_id: pageId,
  kind: "hero",
  variant: "default",
  heading: "Hello",
  sort_order: 0,
  is_visible: true,
  ...extra,
});

const component = (id: string, sectionId: string, extra: Record<string, unknown> = {}) => ({
  id,
  section_id: sectionId,
  kind: "button",
  label: "Get a quote",
  sort_order: 0,
  is_visible: true,
  ...extra,
});

const snapshot = (
  pages: Record<string, unknown>[],
  sections: Record<string, unknown>[] = [],
  components: Record<string, unknown>[] = [],
) => buildFullSnapshot(pages, sections, components, "2024-01-01T00:00:00.000Z");

const open: DraftBranch = {
  id: "b1",
  label: "New homepage",
  status: "open",
  createdAt: "2024-01-01T00:00:00.000Z",
  closedAt: null,
  summary: null,
};

describe("draft branch names", () => {
  it("trims, collapses spaces and bounds the name", () => {
    expect(normaliseBranchLabel("  New   homepage ")).toBe("New homepage");
    expect(normaliseBranchLabel("x".repeat(200)).length).toBe(80);
  });

  it("falls back when nothing usable was typed", () => {
    expect(normaliseBranchLabel("   ")).toBe("Draft");
    expect(normaliseBranchLabel(null, "Draft 2")).toBe("Draft 2");
  });
});

describe("one open draft at a time", () => {
  it("allows a draft when none is open", () => {
    expect(canStartBranch(null).ok).toBe(true);
  });

  it("refuses a second draft and names the open one", () => {
    const guard = canStartBranch(open);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("New homepage");
  });
});

describe("publishing guard", () => {
  it("has no objection when no draft is open", () => {
    expect(publishBlockReason(null)).toBeNull();
  });

  it("blocks publishing while a draft is open", () => {
    expect(publishBlockReason(open)).toContain("New homepage");
  });
});

describe("what changed in a draft", () => {
  it("reports no change when the website is identical", () => {
    const base = snapshot([page("p1")], [section("s1", "p1")], [component("c1", "s1")]);
    const change = branchChange(base, base);
    expect(branchIsUnchanged(change)).toBe(true);
    expect(describeBranchChange(change)).toBe("Nothing has changed in this draft yet.");
  });

  it("counts added, removed and edited pages", () => {
    const base = snapshot([page("p1"), page("p2")], [section("s1", "p1")]);
    const current = snapshot(
      [page("p1", { title: "Changed" }), page("p3")],
      [section("s1", "p1"), section("s3", "p3")],
    );
    const change = branchChange(base, current);
    expect(change).toMatchObject({ pagesAdded: 1, pagesRemoved: 1, pagesChanged: 1 });
    expect(branchIsUnchanged(change)).toBe(false);
    expect(describeBranchChange(change)).toContain("1 new page");
    expect(describeBranchChange(change)).toContain("1 page removed");
    expect(describeBranchChange(change)).toContain("1 section added");
  });

  it("notices a wording change deep inside a section item", () => {
    const base = snapshot([page("p1")], [section("s1", "p1")], [component("c1", "s1")]);
    const current = snapshot(
      [page("p1")],
      [section("s1", "p1")],
      [component("c1", "s1", { label: "Book a call" })],
    );
    const change = branchChange(base, current);
    expect(change.pagesChanged).toBe(1);
    expect(branchIsUnchanged(change)).toBe(false);
    expect(describeBranchChange(change)).toContain("1 page edited");
  });

  it("describes item counts going up and down", () => {
    const base = snapshot([page("p1")], [section("s1", "p1")], [component("c1", "s1")]);
    const fewer = snapshot([page("p1")], [section("s1", "p1")]);
    expect(describeBranchChange(branchChange(base, fewer))).toContain("1 item removed");
    expect(describeBranchChange(branchChange(fewer, base))).toContain("1 item added");
  });
});

describe("stored summaries", () => {
  it("reads a complete summary back", () => {
    const change = branchChange(snapshot([page("p1")]), snapshot([page("p1"), page("p2")]));
    expect(readBranchChange(JSON.parse(JSON.stringify(change)))).toEqual(change);
  });

  it("rejects anything it cannot trust", () => {
    expect(readBranchChange(null)).toBeNull();
    expect(readBranchChange([])).toBeNull();
    expect(readBranchChange({ pagesAdded: 1 })).toBeNull();
  });
});
