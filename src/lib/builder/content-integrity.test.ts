import { describe, expect, it } from "vitest";
import {
  ContentIntegrityError,
  assertContentIntegrity,
  inspectContentIntegrity,
} from "@/lib/builder/content-integrity";

describe("content integrity is a hard gate", () => {
  it("rejects the gibberish that reached a real build", () => {
    const findings = inspectContentIntegrity({ businessName: "Wieueueu", description: "Ueueueu" });
    expect(findings.length).toBeGreaterThan(0);
    expect(() => assertContentIntegrity({ businessName: "Wieueueu" })).toThrow(ContentIntegrityError);
  });

  it("rejects lorem ipsum, fixture data and fake contact details", () => {
    expect(inspectContentIntegrity({ intro: "Lorem ipsum dolor sit amet" }).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity({ email: "test@example.com" }).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity({ phone: "555-123-4567" }).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity({ address: "123 Main St" }).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity({ owner: "John Doe" }).length).toBeGreaterThan(0);
  });

  it("rejects empty headings and duplicated filler", () => {
    expect(inspectContentIntegrity({ heroHeadline: "   " }).length).toBeGreaterThan(0);
    expect(
      inspectContentIntegrity({ a: "same filler text", b: "same filler text", c: "same filler text" }).length,
    ).toBeGreaterThan(0);
  });

  it("lets real businesses through, including short and non-English names", () => {
    expect(
      inspectContentIntegrity({
        businessName: "Ridge Auto Detailing",
        description: "Mobile paint correction and ceramic coating in Leeds.",
        phone: "0113 496 0182",
        email: "hello@ridgedetailing.co.uk",
      }),
    ).toEqual([]);
    expect(inspectContentIntegrity({ businessName: "Bäckerei Höfler" })).toEqual([]);
    expect(inspectContentIntegrity({ businessName: "Kalø" })).toEqual([]);
  });

  it("explains the problem without inventing a replacement", () => {
    try {
      assertContentIntegrity({ businessName: "Wieueueu" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentIntegrityError);
      expect((error as Error).message).toMatch(/nothing was invented/i);
    }
  });
});
