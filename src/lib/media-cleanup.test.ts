import { describe, expect, it } from "vitest";
import { inWorkspaceFolder, orphanedObjects, referenceText } from "@/lib/media-cleanup";

const ORG = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;
const now = Date.parse("2026-10-07T00:00:00Z");
const old = new Date(now - 30 * DAY).toISOString();
const fresh = new Date(now - 2 * DAY).toISOString();

describe("orphaned media clean-up", () => {
  it("only considers files inside the workspace's own folder", () => {
    expect(inWorkspaceFolder(`${ORG}/a.jpg`, ORG)).toBe(true);
    expect(inWorkspaceFolder(`other/${ORG}/a.jpg`, ORG)).toBe(false);
    expect(inWorkspaceFolder(`${ORG}/../x.jpg`, ORG)).toBe(false);
    expect(inWorkspaceFolder(`${ORG}/`, ORG)).toBe(false);
  });

  it("finds references nested in layouts, versions and encoded URLs", () => {
    const text = referenceText([
      { settings: { composition: { root: { children: [{ src: `${ORG}/hero-abc.jpg` }] } } } },
      { pages: { format: 1, pages: [{ sections: [{ components: [{ media_url: `https://x/sign/tenant-media/${ORG}%2Fteam-xyz.png?token=t` }] }] }] } },
    ]);
    expect(text).toContain(`${ORG}/hero-abc.jpg`);
    expect(text).toContain(`${ORG}/team-xyz.png`);
  });

  it("deletes only old, unreferenced files", () => {
    const objects = [
      { path: `${ORG}/used.jpg`, createdAt: old },
      { path: `${ORG}/orphan.jpg`, createdAt: old },
      { path: `${ORG}/new-orphan.jpg`, createdAt: fresh },
      { path: `${ORG}/no-date.jpg`, createdAt: null },
      { path: `${ORG}/by-name.jpg`, createdAt: old },
    ];
    const refs = referenceText([{ url: `${ORG}/used.jpg` }, { file_name: "by-name.jpg" }]);
    expect(orphanedObjects(objects, ORG, refs, { now }).map((o) => o.path)).toEqual([`${ORG}/orphan.jpg`]);
  });

  it("respects a custom grace period", () => {
    const objects = [{ path: `${ORG}/x.jpg`, createdAt: fresh }];
    expect(orphanedObjects(objects, ORG, "", { now, graceDays: 1 })).toHaveLength(1);
    expect(orphanedObjects(objects, ORG, "", { now })).toHaveLength(0);
  });
});
