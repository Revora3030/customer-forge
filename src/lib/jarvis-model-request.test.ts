import { describe, expect, it } from "vitest";
import { jarvisModelRequest } from "./jarvis-model-request.server";

describe("admin Jarvis model access", () => {
  it("does not restrict conversation work to the free-only lane", () => {
    const request = jarvisModelRequest([{ role: "user", content: "Build a site" }], 3500);
    expect(request).not.toHaveProperty("freeOnly");
    expect(request.role).toBe("conversation");
    expect(request.maxOutputTokens).toBe(3500);
  });
});