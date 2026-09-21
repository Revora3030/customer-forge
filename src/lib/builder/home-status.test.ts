import { describe, expect, it } from "vitest";
import { builderHomeStatus, type HomeFacts } from "./home-status";

const base: HomeFacts = {
  businessName: "Ridge Roofing",
  industry: "Roofing",
  pagesCount: 5,
  visibleSectionsCount: 18,
  publishState: "draft",
  working: false,
  currentRequest: null,
  queuedCount: 0,
  blockingCount: 0,
  topBlocking: null,
  improvementCount: 0,
  score: 96,
  measured: true,
};

const byKey = (facts: HomeFacts) =>
  Object.fromEntries(builderHomeStatus(facts).map((answer) => [answer.key, answer]));

describe("builderHomeStatus", () => {
  it("always answers the four questions in order", () => {
    expect(builderHomeStatus(base).map((a) => a.key)).toEqual([
      "building",
      "changing",
      "attention",
      "ready",
    ]);
  });

  it("names the business being built", () => {
    expect(byKey(base)["building"]?.answer).toBe("Ridge Roofing · Roofing");
  });

  it("asks for details when the business has no name", () => {
    const answer = byKey({ ...base, businessName: null })["building"];
    expect(answer?.action?.target).toBe("setup");
  });

  it("shows the request being worked on", () => {
    const answer = byKey({
      ...base,
      working: true,
      currentRequest: "Add a pricing page",
      queuedCount: 2,
    })["changing"];
    expect(answer?.answer).toBe("Add a pricing page");
    expect(answer?.detail).toContain("2 more");
  });

  it("puts blocking items ahead of improvements", () => {
    const answer = byKey({
      ...base,
      blockingCount: 2,
      topBlocking: "No way to contact you",
      improvementCount: 4,
    })["attention"];
    expect(answer?.answer).toContain("2 things");
    expect(answer?.tone).toBe("attention");
  });

  it("never says ready to go live while something blocks it", () => {
    const answer = byKey({ ...base, blockingCount: 1, topBlocking: "Missing phone" })["ready"];
    expect(answer?.answer).toBe("Not ready to go live");
  });

  it("never says ready without real screen measurements", () => {
    const answer = byKey({ ...base, measured: false, score: null })["ready"];
    expect(answer?.answer).toBe("Nearly ready");
    expect(answer?.action?.target).toBe("qa");
  });

  it("only claims live when the site is published", () => {
    expect(byKey({ ...base, publishState: "published" })["ready"]?.answer).toBe(
      "Your site is live",
    );
    expect(byKey(base)["ready"]?.answer).not.toContain("live");
  });

  it("reports not started before anything is built", () => {
    const answers = byKey({ ...base, pagesCount: 0, visibleSectionsCount: 0, measured: false });
    expect(answers["ready"]?.answer).toBe("Not started yet");
    expect(answers["building"]?.detail).toContain("Nothing built yet");
  });
});
