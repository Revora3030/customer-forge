import { describe, expect, it } from "vitest";
import { builderNeedKeys, type BuilderNeedFacts } from "@/lib/builder-needs";

const healthy: BuilderNeedFacts = {
  canManage: true,
  requiredAnswers: 0,
  pagesCount: 4,
  mediaCount: 6,
  brandSet: true,
  publishState: "published",
  domainVerified: true,
  captureCount: 2,
  failingChecks: 0,
};

describe("builderNeedKeys", () => {
  it("shows nothing when the website is healthy", () => {
    expect(builderNeedKeys(healthy)).toEqual([]);
  });

  it("never asks a viewer to fix anything", () => {
    expect(
      builderNeedKeys({ ...healthy, canManage: false, requiredAnswers: 3, failingChecks: 2 }),
    ).toEqual([]);
  });

  it("asks for required answers before anything else", () => {
    expect(builderNeedKeys({ ...healthy, requiredAnswers: 2 })[0]).toBe("answers");
  });

  it("only asks for photos, a look and enquiries once pages exist", () => {
    const empty = builderNeedKeys({
      ...healthy,
      pagesCount: 0,
      mediaCount: 0,
      brandSet: false,
      captureCount: 0,
      publishState: "draft",
    });
    expect(empty).toEqual([]);
  });

  it("flags photos, look and enquiries on a built site", () => {
    expect(
      builderNeedKeys({ ...healthy, mediaCount: 0, brandSet: false, captureCount: 0 }),
    ).toEqual(["photos", "look", "enquiries"]);
  });

  it("suggests a domain only for a live site without one", () => {
    expect(builderNeedKeys({ ...healthy, domainVerified: false })).toEqual(["domain"]);
    expect(
      builderNeedKeys({ ...healthy, publishState: "draft", domainVerified: false }),
    ).toEqual([]);
  });

  it("reports real failing checks", () => {
    expect(builderNeedKeys({ ...healthy, failingChecks: 3 })).toEqual(["broken"]);
  });
});
