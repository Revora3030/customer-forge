import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  publicSubmissionErrorMessage,
  SITE_NOT_LIVE_MESSAGE,
  siteAcceptsSubmissions,
} from "@/lib/site-submission-gate";
import { publishMarkedLive } from "@/lib/production.functions";
import { formsBlockedForSite } from "@/components/site/SiteForms";
import { canPublishRole } from "@/components/site/SiteNotLiveNotice";

describe("public-submission publish gate (mirror of ORG_NOT_PUBLIC)", () => {
  it("refuses a new workspace with no website_settings row", () => {
    expect(siteAcceptsSubmissions({ isDemo: false, published: null, publishState: null })).toBe(
      false,
    );
  });
  it("refuses sites the owner took offline", () => {
    expect(siteAcceptsSubmissions({ publishState: "unpublished", published: false })).toBe(false);
  });
  it("accepts draft and preview sites so a new workspace's forms work before it is published", () => {
    expect(siteAcceptsSubmissions({ publishState: "draft", published: false })).toBe(true);
    expect(siteAcceptsSubmissions({ publishState: "preview", published: false })).toBe(true);
  });
  it("accepts published, preview-state, published-flag and demo workspaces", () => {
    expect(siteAcceptsSubmissions({ publishState: "published" })).toBe(true);
    expect(siteAcceptsSubmissions({ publishState: "preview" })).toBe(true);
    expect(siteAcceptsSubmissions({ published: true, publishState: "draft" })).toBe(true);
    expect(siteAcceptsSubmissions({ isDemo: true })).toBe(true);
  });
  it("never accepts a suspended workspace", () => {
    expect(
      siteAcceptsSubmissions({
        isSuspended: true,
        isDemo: true,
        published: true,
        publishState: "published",
      }),
    ).toBe(false);
  });
  it("matches the condition in the migration that defines the gate", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const files = readdirSync(dir).filter((f) =>
      readFileSync(join(dir, f), "utf8").includes("ORG_NOT_PUBLIC"),
    );
    expect(files.length).toBeGreaterThan(0);
    const sql = readFileSync(join(dir, files.sort().at(-1)!), "utf8").replace(/\s+/g, " ");
    expect(sql).toContain("coalesce(o.is_suspended, false) = false");
    expect(sql).toContain(
      "coalesce(o.is_demo, false) or coalesce(w.published, false) or w.publish_state in ('published', 'preview', 'draft')",
    );
  });
});

describe("visitor wording for database errors", () => {
  it("explains ORG_NOT_PUBLIC instead of the generic failure", () => {
    expect(publicSubmissionErrorMessage("P0001: ORG_NOT_PUBLIC")).toBe(SITE_NOT_LIVE_MESSAGE);
    expect(SITE_NOT_LIVE_MESSAGE).toBe(
      "This site isn't live yet, so forms will start working once the owner publishes it.",
    );
  });
  it("keeps the existing mappings", () => {
    expect(publicSubmissionErrorMessage("BOOKING_CONFLICT")).toMatch(/just taken/);
    expect(publicSubmissionErrorMessage("appointments_no_overlap")).toMatch(/just taken/);
    expect(publicSubmissionErrorMessage("TIME_IN_PAST")).toMatch(/future/);
    expect(publicSubmissionErrorMessage("INVALID_TIME")).toMatch(/valid appointment/);
    expect(publicSubmissionErrorMessage("INVALID_SERVICE")).toMatch(/no longer available/);
    expect(publicSubmissionErrorMessage("RATE_LIMITED")).toMatch(/already received/);
    expect(publicSubmissionErrorMessage("something else")).toBe(
      "We couldn't save your request. Please try again.",
    );
    expect(publicSubmissionErrorMessage(undefined)).toBe(
      "We couldn't save your request. Please try again.",
    );
  });
});

describe("forms on a site that isn't live", () => {
  it("are replaced by the note on a shared preview of an unpublished site", () => {
    expect(formsBlockedForSite({ acceptsSubmissions: false }, false)).toBe(true);
  });
  it("keep working (simulated) in the owner's builder preview", () => {
    expect(formsBlockedForSite({ acceptsSubmissions: false }, true)).toBe(false);
  });
  it("work normally once the gate accepts the site", () => {
    expect(formsBlockedForSite({ acceptsSubmissions: true }, false)).toBe(false);
  });
  it("only offers the Publish link to roles that can publish", () => {
    expect(canPublishRole("owner")).toBe(true);
    expect(canPublishRole("admin")).toBe(true);
    expect(canPublishRole("manager")).toBe(true);
    expect(canPublishRole("member")).toBe(false);
    expect(canPublishRole(null)).toBe(false);
  });
});

describe("publish leaves the workspace in a state the gate accepts", () => {
  it("is satisfied only by a row marked published", () => {
    expect(publishMarkedLive([{ published: true, publish_state: "published" }])).toBe(true);
    expect(publishMarkedLive([])).toBe(false);
    expect(publishMarkedLive(null)).toBe(false);
    expect(publishMarkedLive([{ published: false, publish_state: "draft" }])).toBe(false);
  });
  it("every publishMarkedLive row also passes the submission gate", () => {
    const row = { published: true, publish_state: "published" };
    expect(publishMarkedLive([row])).toBe(true);
    expect(
      siteAcceptsSubmissions({
        isDemo: false,
        published: row.published,
        publishState: row.publish_state,
      }),
    ).toBe(true);
  });
});
