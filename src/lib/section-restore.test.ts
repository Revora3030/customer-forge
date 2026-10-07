import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FullSection } from "@/lib/site-restore";
import { planSectionRestore, sectionHistory, sectionInVersion, withSectionFrom } from "@/lib/section-restore";

const section = (heading: string, extra: Partial<FullSection> = {}): FullSection => ({
  id: "s1",
  page_id: "p1",
  kind: "hero",
  variant: "default",
  heading,
  subheading: null,
  body: null,
  settings: {},
  sort_order: 0,
  is_visible: true,
  components: [],
  ...extra,
});
const snapshot = (sections: FullSection[]) => ({
  format: 1 as const,
  takenAt: "t",
  pages: [{ id: "p1", slug: "home", title: "Home", kind: "home", seo_title: null, seo_description: null, seo_canonical: null, og_title: null, og_description: null, og_image_url: null, noindex: false, sort_order: 0, is_visible: true, sections }],
});

describe("single-section restore", () => {
  it("finds a section inside a stored version (plain or nested full)", () => {
    expect(sectionInVersion(snapshot([section("Old")]), "s1")?.heading).toBe("Old");
    expect(sectionInVersion({ full: snapshot([section("Old")]) }, "s1")?.heading).toBe("Old");
    expect(sectionInVersion({ settings_pages: [] }, "s1")).toBeNull();
  });

  it("lists only versions where the section actually changed", () => {
    const history = sectionHistory(
      [
        { id: "v3", version: 3, label: null, created_at: "c", pages: snapshot([section("New")]) },
        { id: "v2", version: 2, label: null, created_at: "c", pages: snapshot([section("New")]) },
        { id: "v1", version: 1, label: null, created_at: "c", pages: snapshot([section("Old")]) },
      ],
      "s1",
    );
    expect(history.map((h) => [h.version, h.changed])).toEqual([[3, true], [2, false], [1, true]]);
  });

  it("replaces exactly one section and keeps its current position", () => {
    const other = section("Keep", { id: "s2", sort_order: 1 });
    const current = snapshot([section("Now", { sort_order: 5 }), other]);
    const merged = withSectionFrom(current, section("Old", { sort_order: 0 }))!;
    expect(merged.pages[0]!.sections[0]).toMatchObject({ id: "s1", heading: "Old", sort_order: 5 });
    expect(merged.pages[0]!.sections[1]).toBe(other);
    expect(withSectionFrom(snapshot([other]), section("Old"))).toBeNull();
  });

  it("plans element deletes and rewrites for that section only", () => {
    const saved = section("Old", { components: [{ id: "c1", section_id: "s1", kind: "text", label: null, body: "a", link_label: null, link_url: null, media_url: null, settings: {}, sort_order: 0, is_visible: true }] });
    const plan = planSectionRestore(saved, ["c1", "c2"]);
    expect(plan.deleteComponentIds).toEqual(["c2"]);
    expect(plan.upsertComponents.map((c) => c.id)).toEqual(["c1"]);
    expect(plan.section.heading).toBe("Old");
  });
});

describe("customer-site form accessibility (regression guard)", () => {
  it("every visible form control on a customer site has a label", () => {
    const dir = resolve(__dirname, "../components/site");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx"))) {
      const body = readFileSync(join(dir, file), "utf8");
      for (const match of body.matchAll(/<(Input|Textarea|input|textarea|select)\b/g)) {
        const start = match.index ?? 0;
        // Read the whole JSX tag: `>` inside `{...}` (arrow functions) is skipped.
        let depth = 0;
        let end = start;
        for (; end < body.length; end += 1) {
          const ch = body[end];
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          else if (ch === ">" && depth === 0) break;
        }
        const attrs = body.slice(start, end);
        if (/type="hidden"|aria-hidden|tabIndex=\{-1\}|\bid=|aria-label|aria-labelledby/.test(attrs)) continue;
        // Inside an open <label> element counts as labelled.
        const before = body.slice(Math.max(0, start - 1200), start);
        const lastOpen = before.lastIndexOf("<label");
        if (lastOpen !== -1 && before.indexOf("</label>", lastOpen) === -1) continue;
        offenders.push(`${file}:${body.slice(0, start).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
