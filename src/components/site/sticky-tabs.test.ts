import { describe, expect, it } from "vitest";
import { stickyIconFor, stickyTabSlots } from "./sticky-tabs";

const call = { label: "Call", href: "tel:+16140000142", ariaLabel: "Call A" };
const quote = { label: "Get quote", href: "#quote", ariaLabel: "Get quote from A" };
const maps = { label: "Directions", href: "https://www.google.com/maps/dir/?api=1&destination=x", ariaLabel: "Directions to A" };

describe("stickyTabSlots", () => {
  it("orders Call | Get quote (highlighted) | Directions", () => {
    expect(stickyTabSlots({ primary: quote, secondary: call, tertiary: maps }).map((s) => [s.role, s.action.label])).toEqual([
      ["secondary", "Call"], ["primary", "Get quote"], ["tertiary", "Directions"],
    ]);
  });
  it("drops slots with no label or link", () => {
    expect(stickyTabSlots({ primary: quote, secondary: { ...call, href: "" }, tertiary: { ...maps, label: " " } }).map((s) => s.role)).toEqual(["primary"]);
    expect(stickyTabSlots({ primary: { ...quote, href: "" } })).toEqual([]);
  });
});

describe("stickyIconFor", () => {
  it("picks an icon from the link", () => {
    expect(stickyIconFor("tel:+1", "secondary")).toBe("phone");
    expect(stickyIconFor(maps.href, "tertiary")).toBe("pin");
    expect(stickyIconFor("https://maps.apple.com/?daddr=x", "tertiary")).toBe("pin");
    expect(stickyIconFor("#quote", "primary")).toBe("quote");
    expect(stickyIconFor("/contact", "tertiary")).toBe("message");
  });
});
