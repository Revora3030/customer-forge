import { describe, expect, it } from "vitest";
import { describeCustomBlock, parseCustomBlock } from "./custom-block";

function spec(raw: unknown) {
  const parsed = parseCustomBlock(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.spec;
}

describe("extended custom blocks", () => {
  it("accepts an accordion and requires body text on every entry", () => {
    const parsed = spec({
      type: "accordion",
      title: "Common questions",
      items: [
        { label: "Do you cover my area?", body: "We work across the city and nearby villages." },
        { label: "How soon can you start?", body: "Usually within a week." },
      ],
    });
    expect(parsed.type).toBe("accordion");
    expect(describeCustomBlock(parsed)).toContain("2 entries");
    expect(parseCustomBlock({ type: "accordion", items: [{ label: "No body" }, { label: "Also none" }] }).ok).toBe(
      false,
    );
  });

  it("accepts a timeline and needs a short marker on every entry", () => {
    const parsed = spec({
      type: "timeline",
      items: [
        { marker: "Day 1", label: "Site survey", body: "We measure up." },
        { marker: "Day 2", label: "Quote sent" },
      ],
    });
    expect(parsed).toMatchObject({ type: "timeline" });
    expect(parseCustomBlock({ type: "timeline", items: [{ label: "No marker" }, { label: "Nope" }] }).ok).toBe(false);
  });

  it("accepts a filterable list and requires at least two distinct tags", () => {
    const parsed = spec({
      type: "filter",
      items: [
        { label: "Bathroom refit", tags: ["Bathrooms"] },
        { label: "Kitchen refit", tags: ["Kitchens"] },
        { label: "Wet room", tags: ["Bathrooms"] },
      ],
    });
    expect(describeCustomBlock(parsed)).toContain("2 tags");
    const oneTag = parseCustomBlock({
      type: "filter",
      items: [
        { label: "A", tags: ["Same"] },
        { label: "B", tags: ["Same"] },
        { label: "C", tags: ["Same"] },
      ],
    });
    expect(oneTag.ok).toBe(false);
    if (oneTag.ok) return;
    expect(oneTag.reason).toContain("distinct tags");
  });

  it("requires a guide-only note on an eligibility checker", () => {
    const missing = parseCustomBlock({
      type: "eligibility",
      questions: [{ prompt: "Within 20 miles?" }],
      pass: { label: "Covered" },
      fail: { label: "Ask us" },
    });
    expect(missing.ok).toBe(false);
    const parsed = spec({
      type: "eligibility",
      note: "Guide only — we confirm every job before booking.",
      questions: [{ prompt: "Within 20 miles?" }, { prompt: "Is there parking?" }],
      pass: { label: "You're covered", body: "Send us a message." },
      fail: { label: "Ask us first" },
    });
    expect(parsed).toMatchObject({ type: "eligibility" });
    expect(describeCustomBlock(parsed)).toContain("2 yes/no questions");
  });

  it("accepts a booking selector and refuses an off-site call to action", () => {
    const parsed = spec({
      type: "booking",
      note: "Every request is confirmed by phone before it is booked.",
      services: ["Boiler service", "Emergency call-out"],
      times: ["Weekday mornings", "Saturday"],
      ctaLabel: "Request this time",
      ctaHref: "https://evil.example.com",
    });
    if (parsed.type !== "booking") throw new Error("wrong type");
    expect(parsed.ctaHref).toBe("#contact");
    expect(describeCustomBlock(parsed)).toContain("2 services");
    expect(parseCustomBlock({ type: "booking", note: "x", services: [], times: ["a"] }).ok).toBe(false);
  });

  it("bounds progress values to 0-100", () => {
    const parsed = spec({
      type: "gauge",
      items: [
        { label: "Jobs on time", value: 96, caption: "Last 12 months" },
        { label: "Repeat customers", value: 61 },
      ],
    });
    if (parsed.type !== "gauge") throw new Error("wrong type");
    expect(parsed.items[0]?.value).toBe(96);
    expect(
      parseCustomBlock({
        type: "gauge",
        items: [
          { label: "Too big", value: 140 },
          { label: "Fine", value: 10 },
        ],
      }).ok,
    ).toBe(false);
  });

  it("still rejects markup and script schemes in the new blocks", () => {
    expect(
      parseCustomBlock({
        type: "accordion",
        items: [
          { label: "<script>x</script>", body: "ok" },
          { label: "fine", body: "ok" },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseCustomBlock({
        type: "booking",
        note: "javascript: alert(1)",
        services: ["a"],
        times: ["b"],
      }).ok,
    ).toBe(false);
  });
});
