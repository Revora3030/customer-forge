import { describe, expect, it } from "vitest";
import { estimateTotal, estimatorOptions } from "./live-blocks-utils";
import { COMPOSITION_WIDGETS } from "@/lib/builder/composition-tree";

describe("service estimator (item 6)", () => {
  const rows = [
    { id: "a", name: "Exterior wash", price: 120, duration_minutes: 60 },
    { id: "b", name: "Paint correction", starting_price: 400, duration_minutes: 240 },
    { id: "c", name: "Consultation", duration_minutes: 30 },
    { id: "d", name: "Mystery service" },
  ];

  it("uses only the owner's real prices and durations", () => {
    const options = estimatorOptions(rows);
    expect(options.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("sums picks and marks starting prices as From", () => {
    const options = estimatorOptions(rows);
    expect(estimateTotal(options, new Set(["a"])).price).not.toMatch(/^From/);
    const both = estimateTotal(options, new Set(["a", "b", "c"]));
    expect(both.price).toMatch(/^From .*520/);
    expect(both.duration).toBe("5 hr 30 min");
    expect(both.unpriced).toBe(1);
  });

  it("is a registered widget", () => {
    expect(COMPOSITION_WIDGETS).toContain("service_estimator");
  });
});
