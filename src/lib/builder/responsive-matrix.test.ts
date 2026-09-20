import { describe, expect, it } from "vitest";

import {
  DEVICE_MATRIX,
  columnsAt,
  evaluateDeviceMatrix,
  summarizeDeviceMatrix,
  type MatrixSite,
} from "@/lib/builder/responsive-matrix";

const site: MatrixSite = {
  navItemCount: 5,
  pages: [
    {
      id: "home",
      title: "Home",
      sections: [
        { id: "hero", kind: "hero", heading: "Roofing done right", componentCount: 3 },
        { id: "services", kind: "services", componentCount: 4, itemCount: 6 },
      ],
    },
  ],
};

describe("responsive device matrix", () => {
  it("covers every promised width from 320 to 1440", () => {
    expect(DEVICE_MATRIX.map((entry) => entry.width)).toEqual([
      320, 375, 390, 414, 768, 1024, 1280, 1440,
    ]);
  });

  it("stacks to one column on phones and three on desktop", () => {
    expect(columnsAt(320)).toBe(1);
    expect(columnsAt(768)).toBe(2);
    expect(columnsAt(1440)).toBe(3);
  });

  it("never turns a missing measurement into a pass", () => {
    const checks = evaluateDeviceMatrix(site);
    const overflow = checks.filter((check) => check.check === "no horizontal overflow");
    expect(overflow).toHaveLength(DEVICE_MATRIX.length);
    expect(overflow.every((check) => check.verdict === "NOT_VERIFIED")).toBe(true);
    expect(summarizeDeviceMatrix(checks).measured).toBe(false);
  });

  it("uses real geometry when the browser pass measured it", () => {
    const checks = evaluateDeviceMatrix(
      site,
      DEVICE_MATRIX.map((entry) => ({
        width: entry.width,
        pageId: "home",
        scrollWidth: entry.width,
        clientWidth: entry.width,
      })),
    );
    const summary = summarizeDeviceMatrix(checks);
    expect(summary.measured).toBe(true);
    expect(summary.notVerified).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it("fails a measured overflow and names the amount", () => {
    const checks = evaluateDeviceMatrix(site, [
      { width: 320, pageId: "home", scrollWidth: 420, clientWidth: 320 },
    ]);
    const failure = checks.find(
      (check) => check.width === 320 && check.check === "no horizontal overflow",
    );
    expect(failure?.verdict).toBe("FAIL");
    expect(failure?.detail).toContain("100px");
  });

  it("fails clipped elements from measured evidence", () => {
    const checks = evaluateDeviceMatrix(site, [
      {
        width: 375,
        pageId: "home",
        scrollWidth: 375,
        clientWidth: 375,
        clippedSelectors: [".hero h1"],
      },
    ]);
    expect(
      checks.find((check) => check.width === 375 && check.check === "nothing clipped")?.verdict,
    ).toBe("FAIL");
  });

  it("flags a phone menu with too many links", () => {
    const checks = evaluateDeviceMatrix({ ...site, navItemCount: 11 });
    const nav = checks.filter((check) => check.check === "navigation fits a phone");
    expect(nav).toHaveLength(4);
    expect(nav.every((check) => check.verdict === "FAIL")).toBe(true);
  });

  it("flags a wall of text on small screens only", () => {
    const heavy: MatrixSite = {
      navItemCount: 4,
      pages: [
        {
          id: "about",
          sections: [{ id: "story", kind: "about", body: "x".repeat(1200), componentCount: 1 }],
        },
      ],
    };
    const checks = evaluateDeviceMatrix(heavy).filter(
      (check) => check.check === "readable copy length per column",
    );
    expect(checks.map((check) => check.width)).toEqual([320, 375, 390, 414, 768, 1024]);
  });

  it("flags crowded touch targets on phones", () => {
    const crowded: MatrixSite = {
      navItemCount: 4,
      pages: [
        { id: "home", sections: [{ id: "cta", kind: "cta", componentCount: 12 }] },
      ],
    };
    const checks = evaluateDeviceMatrix(crowded).filter(
      (check) => check.check === "touch targets are not crowded",
    );
    expect(checks).toHaveLength(4);
  });
});
