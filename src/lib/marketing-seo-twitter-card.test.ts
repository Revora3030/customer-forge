import { describe, expect, it } from "vitest";
import { MARKETING_SEARCH, marketingSearchHead } from "./marketing-seo";

describe("marketingSearchHead twitter card", () => {
  it.each(Object.entries(MARKETING_SEARCH))("%s uses summary_large_image with an image", (_key, page) => {
    const head = marketingSearchHead(page);
    const meta = head.meta as Array<Record<string, string>>;
    expect(meta.find((m) => m.name === "twitter:card")?.content).toBe("summary_large_image");
    expect(meta.some((m) => m.name === "twitter:image" || m.property === "og:image")).toBe(true);
  });
});
