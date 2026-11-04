import { describe, expect, it } from "vitest";
import { imageSizeForAspect } from "./image-size";

describe("imageSizeForAspect", () => {
  it("makes wide heroes wide", () => {
    expect(imageSizeForAspect("16:9")).toBe("1536x1024");
    expect(imageSizeForAspect("21:9")).toBe("1536x1024");
  });
  it("makes phone-first scenes tall", () => {
    expect(imageSizeForAspect("4:5")).toBe("1024x1536");
    expect(imageSizeForAspect("9:16")).toBe("1024x1536");
  });
  it("makes cards square", () => {
    expect(imageSizeForAspect("1:1")).toBe("1024x1024");
  });
  it("falls back to wide for unknown shapes", () => {
    expect(imageSizeForAspect(undefined)).toBe("1536x1024");
    expect(imageSizeForAspect("wide")).toBe("1536x1024");
  });
});
