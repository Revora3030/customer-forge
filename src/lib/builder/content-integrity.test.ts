import { describe, expect, it } from "vitest";
import {
  ContentIntegrityError,
  assertContentIntegrity,
  inspectContentIntegrity,
  type IntegrityField,
} from "@/lib/builder/content-integrity";

const fields = (record: Record<string, unknown>, headings: string[] = []): IntegrityField[] =>
  Object.entries(record).map(([field, value]) => ({
    field,
    value,
    heading: headings.includes(field),
  }));

describe("content integrity is a hard gate", () => {
  it("rejects the gibberish that reached a real build", () => {
    expect(inspectContentIntegrity(fields({ businessName: "Wieueueu", description: "Ueueueu" })).length).toBeGreaterThan(0);
    expect(() => assertContentIntegrity(fields({ businessName: "Wieueueu" }))).toThrow(ContentIntegrityError);
  });

  it("rejects lorem ipsum, fixture data and fake contact details", () => {
    expect(inspectContentIntegrity(fields({ intro: "Lorem ipsum dolor sit amet" })).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity(fields({ email: "test@example.com" })).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity(fields({ phone: "555-123-4567" })).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity(fields({ address: "123 Main St" })).length).toBeGreaterThan(0);
    expect(inspectContentIntegrity(fields({ owner: "John Doe" })).length).toBeGreaterThan(0);
  });

  it("rejects empty headings and duplicated filler", () => {
    expect(inspectContentIntegrity(fields({ heroHeadline: "   " }, ["heroHeadline"])).length).toBeGreaterThan(0);
    expect(
      inspectContentIntegrity(fields({ a: "same filler text", b: "same filler text", c: "same filler text" })).length,
    ).toBeGreaterThan(0);
  });

  it("lets real businesses through, including non-English names", () => {
    expect(
      inspectContentIntegrity(
        fields({
          businessName: "Ridge Auto Detailing",
          description: "Mobile paint correction and ceramic coating in Leeds.",
          phone: "0113 496 0182",
          email: "hello@ridgedetailing.co.uk",
        }),
      ),
    ).toEqual([]);
    expect(inspectContentIntegrity(fields({ businessName: "Bäckerei Höfler" }))).toEqual([]);
  });

  it("explains the problem without inventing a replacement", () => {
    try {
      assertContentIntegrity(fields({ businessName: "Wieueueu" }));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentIntegrityError);
      expect((error as Error).message).toMatch(/nothing was invented/i);
    }
  });
});
