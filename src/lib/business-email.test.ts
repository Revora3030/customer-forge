import { describe, expect, it } from "vitest";
import { publicContactEmail } from "./business-email";

describe("publicContactEmail", () => {
  it("uses the business email when given", () => {
    expect(publicContactEmail(" Hello@MyShop.com ", "me@gmail.com")).toBe("hello@myshop.com");
  });
  it("falls back to the account email when the field is empty or not an email", () => {
    expect(publicContactEmail("", "Me@Gmail.com")).toBe("me@gmail.com");
    expect(publicContactEmail(undefined, "me@gmail.com")).toBe("me@gmail.com");
    expect(publicContactEmail("not an email", "me@gmail.com")).toBe("me@gmail.com");
  });
  it("is null when neither is usable", () => {
    expect(publicContactEmail("", "")).toBeNull();
  });
});
