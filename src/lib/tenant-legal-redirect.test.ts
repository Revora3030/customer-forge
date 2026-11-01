import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ tenant: false, fail: false }));
vi.mock("@/lib/host-site.functions", () => ({
  getHostSite: async () => {
    if (host.fail) throw new Error("lookup failed");
    return { tenant: host.tenant, result: null };
  },
}));

import { clientDomainLegalRedirect } from "@/lib/tenant-page-utils";

async function outcome(page: "privacy" | "terms") {
  try {
    await clientDomainLegalRedirect(page);
    return "stay";
  } catch (error) {
    const options = (error as { options?: { href?: string; statusCode?: number } }).options;
    return `${options?.statusCode} ${options?.href}`;
  }
}

describe("Revora's policy pages on a client domain", () => {
  beforeEach(() => {
    host.tenant = false;
    host.fail = false;
  });

  it("stay Revora's own pages on Revora's domain", async () => {
    expect(await outcome("privacy")).toBe("stay");
    expect(await outcome("terms")).toBe("stay");
  });

  it("send /privacy to the generated notice and /terms home on a client domain", async () => {
    host.tenant = true;
    expect(await outcome("privacy")).toBe("302 /privacy-notice");
    expect(await outcome("terms")).toBe("302 /");
  });

  it("never block Revora's pages when the host lookup fails", async () => {
    host.fail = true;
    expect(await outcome("privacy")).toBe("stay");
  });
});
