import { describe, expect, it } from "vitest";
import { attachmentNotice, buildCapabilities } from "./capabilities";

describe("builder capabilities", () => {
  it("never claims to read attachments it cannot read", () => {
    const caps = buildCapabilities();
    expect(attachmentNotice(caps, "image")).toMatch(/cannot read/);
    expect(caps.summary).toMatch(/AI design team/);
  });
});
