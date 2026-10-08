import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySummary, skippedReasons } from "@/lib/builder/apply-report";
import {
  businessNameHeadlines,
  stripBusinessNameHeadlines,
  withoutBusinessName,
} from "@/lib/builder/headline-names";
import { distinctServiceArea } from "@/components/site/site-sections-utils";
import type { PageArchitecture } from "@/lib/builder/creative-authority";

const read = (path: string) => readFileSync(path, "utf8");

describe("headlines don't keep repeating the business name", () => {
  const pages: PageArchitecture[] = [
    {
      slug: "home",
      title: "Home",
      purpose: "",
      primaryAction: "",
      sections: [
        { role: "hero", heading: "Test Business Co. — pressure washing in Chapel Hill" },
        { role: "process", heading: "The Test Business Co. Process" },
        { role: "services", heading: "Driveways, decks and siding" },
      ],
    },
    {
      slug: "about",
      title: "About",
      purpose: "",
      primaryAction: "",
      sections: [{ role: "story", heading: "Test Business Co.'s story" }],
    },
  ];

  it("flags every named heading except the home opening", () => {
    const flagged = businessNameHeadlines(pages, "Test Business Co.");
    expect(flagged.map((h) => h.heading)).toEqual(["The Test Business Co. Process", "Test Business Co.'s story"]);
  });

  it("rewrites flagged headings into plain ones", () => {
    expect(withoutBusinessName("The Test Business Co. Process", "Test Business Co.")).toBe("Our process");
    expect(withoutBusinessName("Test Business Co.'s story", "Test Business Co.")).toBe("Our story");
    expect(withoutBusinessName("Clean driveways with Test Business Co.", "Test Business Co.")).toBe("Clean driveways");
    expect(withoutBusinessName("Test Business Co.", "Test Business Co.")).toBe("Test Business Co.");
    const cleaned = stripBusinessNameHeadlines(pages, "Test Business Co.");
    expect(cleaned[0]!.sections[0]!.heading).toContain("Test Business Co.");
    expect(cleaned[0]!.sections[1]!.heading).toBe("Our process");
  });

  it("the page architect is told not to use the name and applies the guard", () => {
    const src = read("src/lib/builder/ai-page-architecture.server.ts");
    expect(src).toContain("Do NOT put the business name in section headings");
    expect(src).toContain("stripBusinessNameHeadlines(normalized.architecture");
  });
});

describe("contact details don't repeat the city", () => {
  it("hides the area when the address already says it", () => {
    expect(distinctServiceArea("Chapel Hill, NC", "12 Main St, Chapel Hill, NC 27514")).toBeNull();
    expect(distinctServiceArea("Chapel Hill", "12 Main St, Chapel Hill, NC")).toBeNull();
  });
  it("keeps a wider service area", () => {
    expect(distinctServiceArea("The Triangle and Durham", "12 Main St, Chapel Hill, NC")).toBe("The Triangle and Durham");
    expect(distinctServiceArea("Chapel Hill, NC", null)).toBe("Chapel Hill, NC");
    expect(distinctServiceArea("", "12 Main St")).toBeNull();
  });
});

describe("skipped updates always come with a reason and a next step", () => {
  it("explains failed writes and picture failures", () => {
    expect(skippedReasons(["skipped set_design_tokens"])).toEqual(["some changes couldn't be saved just now"]);
    expect(skippedReasons(["skipped generate_component_image:generation_failed"])[0]).toContain("picture");
    expect(skippedReasons(["skipped set_composition:would_remove_form"])[0]).toContain("form");
    const summary = applySummary({ applied: 12, failed: 6, stale: 0, details: ["skipped set_backdrop"] });
    expect(summary).toContain("12 of 18");
    expect(summary).toContain("because");
    expect(summary).toContain("Ask for the same change again");
  });
});

describe("writes that used to be unchecked", () => {
  it("the build only notifies after it really recorded completion", () => {
    const src = read("src/lib/site-engine.worker.server.ts");
    expect(src).toMatch(/const completion = await db\s*\.from\("generation_jobs"\)/);
    expect(src).toContain("skipping the ready notification");
    expect(src).toContain("Couldn't save the refined section wording");
    expect(src).toContain("Couldn't clear the pending build marker");
  });
  it("page-review repairs only report what saved", () => {
    const src = read("src/lib/site-upgrade.functions.ts");
    expect(src).toContain("if (effectFailed) skipped.push(repair.kind)");
    expect(src).toContain("if (fitFailed) skipped.push(repair.kind)");
  });
  it("picture regeneration keeps the page and record in step", () => {
    const src = read("src/lib/image-records.functions.ts");
    expect(src).toContain("if (repoint.error)");
    expect(src).toContain("if (recordWrite.error)");
  });
  it("lead status, backups and checkout sessions are checked", () => {
    expect(read("src/lib/queries.ts")).toContain("if (leadStatusError) throw leadStatusError");
    const backup = read("src/lib/backup.server.ts");
    expect(backup).toContain("deleteError");
    expect(backup).toContain("markError");
    expect(read("src/lib/stripe.functions.ts")).toContain("stripe-service-checkout-session-link");
  });
  it("media clean-up treats every picture reference as in use", () => {
    const src = read("src/lib/media-cleanup.server.ts");
    expect(src).toContain('{ table: "services", columns: "image_url" }');
    expect(src).toContain('{ table: "website_versions", columns: "pages, generation, seo" }');
    expect(src).toContain('{ table: "website_branches", columns: "base_snapshot" }');
  });
});
