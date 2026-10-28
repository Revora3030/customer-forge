import { describe, expect, it } from "vitest";
import { liveStatusLine } from "./live-status";

describe("liveStatusLine", () => {
  it("credits photography to the image team, never to Luna", () => {
    expect(liveStatusLine("generating your pictures", null)).toBe("The image team is making photos for your site…");
    expect(liveStatusLine("making a photo", "Hero")).not.toMatch(/Luna/);
  });

  it("keeps Terra for review and Sol for design and writing", () => {
    expect(liveStatusLine("reviewing for safety", null)).toBe("Terra is checking your site…");
    expect(liveStatusLine("designing your change", "Hero banner")).toBe("Sol is designing Hero banner…");
    expect(liveStatusLine("writing the pages", null)).toBe("Sol is writing your site…");
  });

  it("says nothing without a stage", () => {
    expect(liveStatusLine("", null)).toBeNull();
    expect(liveStatusLine(null, null)).toBeNull();
  });
});
