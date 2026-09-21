import { describe, expect, it } from "vitest";
import { compareLiveSync, syncSummary, type BuilderPage } from "@/lib/builder/live-sync";

const page = (over: Partial<BuilderPage> = {}): BuilderPage => ({
  id: "p1",
  slug: "home",
  title: "Home",
  visible: true,
  sections: [
    {
      id: "s1",
      label: "Hero",
      visible: true,
      items: [{ id: "c1", label: "Book now", visible: true }],
    },
  ],
  ...over,
});

describe("compareLiveSync", () => {
  it("reports everything live when the visitor read returns every switched-on piece", () => {
    const result = compareLiveSync({
      publishState: "published",
      builderPages: [page()],
      visitorPages: [{ slug: "home", sectionIds: ["s1"], itemIds: ["c1"] }],
    });
    expect(result.allLive).toBe(true);
    expect(result.missing).toBe(0);
    expect(result.live).toBe(3);
    expect(result.issues).toHaveLength(0);
    expect(syncSummary(result)).toContain("Every saved change is live");
  });

  it("never claims changes are live while the site is unpublished", () => {
    const result = compareLiveSync({
      publishState: "draft",
      builderPages: [page()],
      visitorPages: [],
    });
    expect(result.published).toBe(false);
    expect(result.allLive).toBe(false);
    expect(result.issues[0]?.scope).toBe("site");
    expect(syncSummary(result)).toContain("not live yet");
  });

  it("flags a saved section that the live site did not return", () => {
    const result = compareLiveSync({
      publishState: "published",
      builderPages: [page()],
      visitorPages: [{ slug: "home", sectionIds: [], itemIds: [] }],
    });
    expect(result.missing).toBe(2);
    expect(result.allLive).toBe(false);
    expect(result.issues.some((issue) => issue.scope === "section")).toBe(true);
  });

  it("flags a saved item that the live site did not return", () => {
    const result = compareLiveSync({
      publishState: "published",
      builderPages: [page()],
      visitorPages: [{ slug: "home", sectionIds: ["s1"], itemIds: [] }],
    });
    expect(result.missing).toBe(1);
    expect(result.issues[0]?.scope).toBe("item");
  });

  it("treats switched-off pieces as choices, not faults", () => {
    const result = compareLiveSync({
      publishState: "published",
      builderPages: [
        page({
          sections: [
            { id: "s1", label: "Hero", visible: false, items: [] },
            {
              id: "s2",
              label: "Prices",
              visible: true,
              items: [{ id: "c9", label: "Basic", visible: false }],
            },
          ],
        }),
      ],
      visitorPages: [{ slug: "home", sectionIds: ["s2"], itemIds: [] }],
    });
    expect(result.missing).toBe(0);
    expect(result.allLive).toBe(true);
    expect(result.hidden).toBe(2);
    expect(result.hiddenNotes).toHaveLength(2);
  });

  it("flags a switched-on page the live site did not return", () => {
    const result = compareLiveSync({
      publishState: "published",
      builderPages: [page({ slug: "about", title: "About" })],
      visitorPages: [],
    });
    expect(result.issues[0]).toMatchObject({ scope: "page", page: "About" });
    expect(result.missing).toBe(1);
  });
});
