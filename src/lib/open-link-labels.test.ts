import { describe, expect, it } from "vitest";
import { openLinkLabel } from "./open-link-labels";

describe("openLinkLabel", () => {
  it("names the website editor and the card", () => {
    expect(openLinkLabel("/app/website", "Website", "Live")).toBe(
      "Open website editor: Website (Live)",
    );
    expect(openLinkLabel("/app/website", "Builder access", "Included")).toBe(
      "Open website editor: Builder access (Included)",
    );
  });
  it("gives other cards their own name", () => {
    expect(openLinkLabel("/app/leads", "Leads & CRM")).toBe("Open Leads & CRM");
  });
  it("two website cards never share a label", () => {
    expect(openLinkLabel("/app/website", "Website")).not.toBe(
      openLinkLabel("/app/website", "Builder access"),
    );
  });
});
