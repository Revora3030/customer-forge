import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builderAccessView, type BuilderAccessStatus } from "./builder-access-status";

function queryInput(data: BuilderAccessStatus | undefined) {
  return {
    signedIn: true,
    hasWorkspace: true,
    checking: false,
    failed: false,
    ...(data !== undefined ? { access: data } : {}),
  } satisfies Parameters<typeof builderAccessView>[0];
}

describe("strict optional builder access data", () => {
  it("omits the access property while query data is unavailable", () => {
    const input = queryInput(undefined);
    expect(Object.prototype.hasOwnProperty.call(input, "access")).toBe(false);
    expect(builderAccessView(input).state).toBe("checking");
  });

  it("passes defined data without widening the access type or changing permissions", () => {
    const data: BuilderAccessStatus = { allowed: true, canManage: false, state: "TRIAL", reason: "trial" };
    const input = queryInput(data);
    expect(input.access).toBe(data);
    expect(builderAccessView(input).state).toBe("readonly");
  });

  it("uses the guarded query-data spread in the actual notice caller", () => {
    const source = readFileSync(new URL("../components/app/BuilderAccessNotice.tsx", import.meta.url), "utf8");
    expect(source).toContain("...(access.data !== undefined ? { access: access.data } : {}),");
    expect(source).not.toContain("    access: access.data,");
  });
});
