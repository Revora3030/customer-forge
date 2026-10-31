import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forms = readFileSync("src/components/site/SiteForms.tsx", "utf8");
const server = readFileSync("src/lib/public-site.functions.ts", "utf8");

describe("lead form analytics and values", () => {
  it("fires a submitted event only after a successful quote / booking / enquiry", () => {
    for (const event of ["quote_submitted", "booking_submitted", "enquiry_submitted"]) {
      expect(forms).toContain(`track("${event}")`);
    }
  });

  it("whitelists the submitted events on the server so they are not rejected", () => {
    const list = /const ANALYTICS_EVENTS = \[([\s\S]*?)\] as const/.exec(server)?.[1] ?? "";
    for (const event of ["quote_submitted", "booking_submitted", "enquiry_submitted"]) {
      expect(list).toContain(`"${event}"`);
    }
  });

  it("does not turn a service's list price into a pipeline value for booking or enquiry leads", () => {
    expect(forms).not.toMatch(/estimatedValue: Number\(service\?\.price/);
    expect((forms.match(/estimatedValue: 0,/g) ?? []).length).toBe(2);
  });
});
