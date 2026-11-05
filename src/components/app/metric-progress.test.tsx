// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MetricCard } from "@/components/app/Bits";
import { metricProgress } from "@/components/app/metric-progress";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("metricProgress", () => {
  it("clamps to 0-100 and floors the painted width at 2%", () => {
    expect(metricProgress(150)).toEqual({ value: 100, width: 100 });
    expect(metricProgress(-5)).toEqual({ value: 0, width: 2 });
    expect(metricProgress(0.4)).toEqual({ value: 0, width: 2 });
    expect(metricProgress(12.5)).toEqual({ value: 13, width: 12.5 });
  });

  it("draws nothing for a figure that is not a finite number", () => {
    expect(metricProgress(Number.NaN)).toBeNull();
    expect(metricProgress(Number.POSITIVE_INFINITY)).toBeNull();
    expect(metricProgress(undefined)).toBeNull();
    expect(metricProgress(null)).toBeNull();
  });
});

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(props: Parameters<typeof MetricCard>[0]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MetricCard {...props} />);
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("MetricCard progress bar", () => {
  it("is announced as a progress bar with the true value and the card label", async () => {
    const el = await mount({ label: "Lead to booking", value: "42%", progress: 42 });
    const bar = el.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-label")).toBe("Lead to booking");
    expect(bar?.getAttribute("aria-valuenow")).toBe("42");
    expect(bar?.getAttribute("aria-valuemax")).toBe("100");
  });

  it("animates width changes unless the visitor prefers reduced motion", async () => {
    const el = await mount({ label: "Score", value: "10", progress: 10 });
    const fill = el.querySelector('[role="progressbar"] > div')!;
    expect(fill.className).toContain("transition-[width]");
    expect(fill.className).toContain("motion-reduce:transition-none");
  });

  it("renders no bar when progress is missing or not a number", async () => {
    const none = await mount({ label: "Visits", value: "9" });
    expect(none.querySelector('[role="progressbar"]')).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    const nan = await mount({ label: "Visits", value: "9", progress: Number.NaN });
    expect(nan.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("keeps the full label reachable when it is truncated", async () => {
    const el = await mount({ label: "A very long metric label", value: "1" });
    expect(el.querySelector("span.truncate")?.getAttribute("title")).toBe("A very long metric label");
  });
});
