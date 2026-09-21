import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summariseExceptions, validateExceptions } from "./dependency-exceptions";

const complete = {
  advisory: "CVE-2026-00000",
  package: "left-pad",
  path: "@framework/core > left-pad",
  installedVersion: "1.0.0",
  fixedIn: "1.0.1",
  severity: "high",
  reachability: "build_time_only",
  exploitability: "Only parsed at build time from repository-controlled input.",
  compensatingControls: ["No untrusted input reaches the parser."],
  upstreamConstraint: "Framework pins the vulnerable range.",
  owner: "platform",
  reviewBy: "2099-01-01",
};

describe("dependency security exceptions", () => {
  it("accepts a fully documented, in-date exception", () => {
    expect(validateExceptions({ exceptions: [complete] }, "2026-09-21")).toEqual([]);
  });

  it("rejects an exception that omits required evidence", () => {
    const { exploitability: _drop, ...partial } = complete;
    const problems = validateExceptions({ exceptions: [partial] }, "2026-09-21");
    expect(problems.join(" ")).toContain("exploitability is required");
  });

  it("rejects an exception with no compensating control", () => {
    const problems = validateExceptions(
      { exceptions: [{ ...complete, compensatingControls: [] }] },
      "2026-09-21",
    );
    expect(problems.join(" ")).toContain("compensatingControls");
  });

  it("flags an exception whose review date has passed", () => {
    const problems = validateExceptions(
      { exceptions: [{ ...complete, reviewBy: "2020-01-01" }] },
      "2026-09-21",
    );
    expect(problems.join(" ")).toContain("overdue for review");
  });

  it("rejects a registry that is not an object with an exceptions array", () => {
    expect(validateExceptions([], "2026-09-21").length).toBeGreaterThan(0);
    expect(validateExceptions({ exceptions: "none" }, "2026-09-21").length).toBeGreaterThan(0);
  });

  it("never counts an exception as a resolved finding", () => {
    const summary = summariseExceptions(
      { exceptions: [{ ...complete, reachability: "runtime_reachable" }] as never },
      "2026-09-21",
    );
    expect(summary.total).toBe(1);
    expect(summary.runtimeReachable).toBe(1);
    expect(summary.overdue).toEqual([]);
  });

  it("keeps the committed registry valid", () => {
    const file = JSON.parse(readFileSync("security/dependency-exceptions.json", "utf8")) as unknown;
    expect(validateExceptions(file, new Date().toISOString().slice(0, 10))).toEqual([]);
  });
});
