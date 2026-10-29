import { describe, expect, it } from "vitest";
import { executiveFallback } from "./jarvis-executive-fallback";

describe("executive fallback", () => {
  it("answers from finished checks when every model fails", () => {
    const text = executiveFallback({ ran: ["Builder health"], reason: "quota" });
    expect(text).toContain("Builder health");
    expect(text).toContain("quota");
    expect(text).not.toContain("no eligible AI model could finish");
    expect(text).not.toMatch(/\$\d/);
  });
});
