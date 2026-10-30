import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatVital,
  observeWebVitals,
  percentile75,
  rateVital,
  summariseVitals,
  VITAL_THRESHOLDS,
} from "./web-vitals";

describe("rateVital", () => {
  it("uses the published Core Web Vitals thresholds", () => {
    expect(rateVital("lcp", 2500)).toBe("good");
    expect(rateVital("lcp", 2501)).toBe("needs-improvement");
    expect(rateVital("lcp", 4001)).toBe("poor");
    expect(rateVital("cls", 0.09)).toBe("good");
    expect(rateVital("cls", 0.2)).toBe("needs-improvement");
    expect(rateVital("cls", 0.4)).toBe("poor");
    expect(rateVital("inp", VITAL_THRESHOLDS.inp.good)).toBe("good");
  });

  it("never reports a nonsense value as good", () => {
    expect(rateVital("lcp", Number.NaN)).toBe("poor");
    expect(rateVital("lcp", -10)).toBe("poor");
  });
});

describe("percentile75", () => {
  it("returns null with no measurements instead of inventing one", () => {
    expect(percentile75([])).toBeNull();
  });

  it("reflects the slower end of real visits", () => {
    expect(percentile75([100, 200, 300, 400])).toBe(300);
    expect(percentile75([1000])).toBe(1000);
  });
});

describe("summariseVitals", () => {
  it("marks metrics with no data as not measured", () => {
    const summary = summariseVitals([]);
    expect(summary).toHaveLength(5);
    for (const row of summary) {
      expect(row.samples).toBe(0);
      expect(row.p75).toBeNull();
      expect(row.rating).toBe("not-measured");
    }
  });

  it("scores only from recorded measurements", () => {
    const summary = summariseVitals([
      { metric: "lcp", value: 1000 },
      { metric: "lcp", value: 1200 },
      { metric: "lcp", value: "5000" },
      { metric: "cls", value: 0.02 },
      { metric: "unknown", value: 9 },
    ]);
    const lcp = summary.find((row) => row.metric === "lcp")!;
    expect(lcp.samples).toBe(3);
    expect(lcp.p75).toBe(5000);
    expect(lcp.rating).toBe("poor");
    const cls = summary.find((row) => row.metric === "cls")!;
    expect(cls.samples).toBe(1);
    expect(cls.rating).toBe("good");
    const inp = summary.find((row) => row.metric === "inp")!;
    expect(inp.rating).toBe("not-measured");
  });
});

describe("formatVital", () => {
  it("reads the way an owner expects", () => {
    expect(formatVital("cls", 0.0512)).toBe("0.051");
    expect(formatVital("lcp", 2480)).toBe("2.48s");
    expect(formatVital("inp", 120)).toBe("120ms");
  });
});

describe("observeWebVitals (web-vitals library)", () => {
  function fakeDom() {
    const listeners = new Map<string, Array<() => void>>();
    const add = (type: string, cb: () => void) =>
      listeners.set(type, [...(listeners.get(type) ?? []), cb]);
    const remove = (type: string, cb: () => void) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((x) => x !== cb),
      );
    const doc = { visibilityState: "visible", addEventListener: add, removeEventListener: remove };
    const win = {
      addEventListener: add,
      removeEventListener: remove,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("PerformanceObserver", function PerformanceObserver() {});
    return {
      hide() {
        doc.visibilityState = "hidden";
        for (const cb of listeners.get("visibilitychange") ?? []) cb();
      },
    };
  }

  function fakeLib() {
    const cbs: Record<string, (m: { value: number }) => void> = {};
    const reg = (name: string) => (cb: (m: { value: number }) => void, opts?: { reportAllChanges?: boolean }) => {
      expect(opts?.reportAllChanges).toBe(true);
      cbs[name] = cb;
    };
    return {
      lib: { onLCP: reg("lcp"), onCLS: reg("cls"), onINP: reg("inp"), onFCP: reg("fcp"), onTTFB: reg("ttfb") },
      emit: (name: string, value: number) => cbs[name]?.({ value }),
    };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("reports the latest library values once, rated, when the page is hidden", () => {
    const dom = fakeDom();
    const { lib, emit } = fakeLib();
    const report = vi.fn();
    observeWebVitals(report, lib);
    emit("lcp", 1800);
    emit("lcp", 2600);
    emit("cls", 0.05);
    emit("inp", 120);
    emit("ttfb", 300);
    dom.hide();
    dom.hide();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toEqual([
      { metric: "lcp", value: 2600, rating: "needs-improvement" },
      { metric: "cls", value: 0.05, rating: "good" },
      { metric: "inp", value: 120, rating: "good" },
      { metric: "ttfb", value: 300, rating: "good" },
    ]);
  });

  it("reports nothing when nothing was measured, and is a no-op on the server", () => {
    const dom = fakeDom();
    const report = vi.fn();
    const stop = observeWebVitals(report, fakeLib().lib);
    dom.hide();
    stop();
    expect(report).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(observeWebVitals(report)()).toBeUndefined();
  });
});
