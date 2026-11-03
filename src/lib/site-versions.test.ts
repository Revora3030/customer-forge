import { describe, expect, it } from "vitest";
import {
  MAX_PUBLISHED_VERSIONS,
  buildVersionList,
  diffSnapshots,
  prunableVersionIds,
  restorableVersions,
  restoredFromVersion,
  summarizeChange,
  type PublishedRow,
} from "@/lib/site-versions";

const section = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  variant: "a",
  heading: `${kind} heading`,
  subheading: null,
  body: "body",
  settings: {},
  sort_order: 0,
  is_visible: true,
  components: [],
  ...extra,
});
const page = (id: string, sections: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  title: id.toUpperCase(),
  seo_title: null,
  seo_description: null,
  sections,
  ...extra,
});
const snap = (pages: unknown[], generation: unknown = {}, seo: unknown = {}) => ({
  pages: { live_format: 1, pages },
  generation,
  seo,
});

describe("diffSnapshots + summarizeChange", () => {
  const before = snap([page("home", [section("s1", "hero"), section("s2", "pricing")])]);

  it("reports added, removed and edited sections in one line", () => {
    const after = snap([
      page("home", [section("s1", "hero", { heading: "New headline" }), section("s3", "gallery"), section("s4", "faq")]),
    ]);
    const change = diffSnapshots(before, after);
    expect(change.sectionsAdded).toEqual(["Gallery", "Faq"]);
    expect(change.sectionsRemoved).toEqual(["Pricing"]);
    expect(change.sectionsEdited).toBe(1);
    expect(summarizeChange(change)).toBe(
      "Added 2 sections (Gallery, Faq) · removed 1 section (Pricing) · edited 1 section.",
    );
  });

  it("reports pages added and removed, design style and search changes", () => {
    const after = snap([page("home", [section("s1", "hero"), section("s2", "pricing")]), page("about", [])], { font: "x" }, { h: 1 });
    const change = diffSnapshots(before, after);
    expect(change.pagesAdded).toEqual(["ABOUT"]);
    expect(change.styleChanged).toBe(true);
    expect(change.seoChanged).toBe(true);
    expect(summarizeChange(change)).toContain("Added 1 page (ABOUT)");
    expect(summarizeChange(change)).toContain("changed the design style");
    expect(summarizeChange(diffSnapshots(after, before))).toContain("Removed 1 page (ABOUT)");
  });

  it("treats a reorder or hidden section as an edit, and identical snapshots as no change", () => {
    const hidden = snap([page("home", [section("s1", "hero", { is_visible: false }), section("s2", "pricing")])]);
    expect(diffSnapshots(before, hidden).sectionsEdited).toBe(1);
    expect(summarizeChange(diffSnapshots(before, before))).toBe("No visible changes.");
  });

  it("labels a first publish and tolerates unreadable snapshots", () => {
    expect(summarizeChange(null)).toBe("First published version.");
    expect(diffSnapshots(null, { pages: null }).sectionsAdded).toEqual([]);
  });

  it("caps long name lists", () => {
    const after = snap([
      page("home", [
        section("s1", "hero"),
        section("s2", "pricing"),
        ...["a", "b", "c", "d", "e"].map((k) => section(`n${k}`, k)),
      ]),
    ]);
    expect(summarizeChange(diffSnapshots(before, after))).toContain("(A, B, C +2 more)");
  });
});

const row = (version: number, body: ReturnType<typeof snap>, extra: Partial<PublishedRow> = {}): PublishedRow => ({
  id: `id-${version}`,
  version,
  label: `Production v${version}`,
  created_at: `2026-10-${10 + version}T12:00:00Z`,
  published_at: `2026-10-${10 + version}T12:00:00Z`,
  created_by: "u1",
  pages: body.pages,
  generation: body.generation,
  seo: body.seo,
  ...extra,
});

describe("buildVersionList", () => {
  const v1 = snap([page("home", [section("s1", "hero")])]);
  const v2 = snap([page("home", [section("s1", "hero"), section("s2", "faq")])]);

  it("lists newest first with who, date, summary and the live marker", () => {
    const list = buildVersionList([row(1, v1), row(2, v2, { created_by: "u2" })], new Map([["u1", "Dana"], ["u2", "Sam"]]));
    expect(list.map((e) => e.version)).toEqual([2, 1]);
    expect(list[0]).toMatchObject({ who: "Sam", isLive: true, kind: "publish", summary: "Added 1 section (Faq)." });
    expect(list[1]).toMatchObject({ who: "Dana", isLive: false, summary: "First published version." });
  });

  it("shows a restore as its own entry that names the version it put back", () => {
    const restored = row(3, { ...v1, pages: { ...v1.pages, restored_from: 1 } } as never, {
      label: "Production v3 (restored from v1)",
    });
    const list = buildVersionList([row(1, v1), row(2, v2), restored]);
    expect(list[0]).toMatchObject({ version: 3, kind: "restore", restoredFrom: 1, isLive: true });
    expect(list[0]?.summary).toBe("Restored version 1. Removed 1 section (Faq).");
  });

  it("falls back to a neutral name, and Revora for system publishes", () => {
    const list = buildVersionList([row(1, v1, { created_by: null }), row(2, v2, { created_by: "unknown" })]);
    expect(list[0]?.who).toBe("A team member");
    expect(list[1]?.who).toBe("Revora");
  });

  it("reads the old revert label and ignores ordinary labels", () => {
    expect(restoredFromVersion({ label: "Production v9 (reverted to v7)", pages: {} })).toBe(7);
    expect(restoredFromVersion({ label: "Production v9", pages: {} })).toBeNull();
    expect(restoredFromVersion({ label: null, pages: { restored_from: 4 } })).toBe(4);
  });
});

describe("verification status (optional until sf/post-publish-verify lands)", () => {
  const body = snap([page("home", [])]);
  it("is null today and shown when present", () => {
    const list = buildVersionList([
      row(1, body),
      row(2, body, { verification_status: "passed" }),
      row(3, body, { verification_status: "failed" }),
      row(4, body, { verification_status: "weird" }),
    ]);
    expect(list.map((e) => e.verification)).toEqual([null, "failed", "passed", null]);
  });
  it("rollback never offers failed versions; passedOnly also drops unverified ones", () => {
    const list = buildVersionList([
      row(1, body),
      row(2, body, { verification_status: "passed" }),
      row(3, body, { verification_status: "failed" }),
    ]);
    expect(restorableVersions(list).map((e) => e.version)).toEqual([2, 1]);
    expect(restorableVersions(list, { passedOnly: true }).map((e) => e.version)).toEqual([2]);
  });
});

describe("prunableVersionIds", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i + 1}`, version: i + 1 }));
  it("keeps the newest 20 and returns the older ids", () => {
    expect(prunableVersionIds(rows(20))).toEqual([]);
    expect(MAX_PUBLISHED_VERSIONS).toBe(20);
    expect(prunableVersionIds(rows(23))).toEqual(["v3", "v2", "v1"]);
  });
  it("never prunes the live site and the previous known-good version", () => {
    expect(prunableVersionIds(rows(5), 0)).toEqual(["v3", "v2", "v1"]);
  });
});
