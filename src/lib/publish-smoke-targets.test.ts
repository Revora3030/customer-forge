/** Publish smoke check probes every address a visitor can use. */
import { describe, expect, it } from "vitest";
import { evaluateSmoke, labelChecks, smokeTargets } from "@/lib/publish-smoke";

const origin = "https://revoragrowthsystems.com";

describe("smokeTargets", () => {
  it("always checks the platform /s/<slug> copy", () => {
    expect(smokeTargets({ slug: "elite-mobile-detailing", platformOrigin: origin })).toEqual({
      targets: [{ label: "platform", base: `${origin}/s/elite-mobile-detailing` }],
      pendingDomain: null,
    });
  });
  it("adds a verified custom domain instead of replacing the platform copy", () => {
    const { targets } = smokeTargets({ slug: "acme", customDomain: "Acme.com", dnsOk: true, sslOk: true, platformOrigin: origin });
    expect(targets).toEqual([
      { label: "platform", base: `${origin}/s/acme` },
      { label: "custom_domain", base: "https://acme.com" },
    ]);
  });
  it("names an attached but unverified domain rather than skipping it silently", () => {
    const r = smokeTargets({ slug: "acme", customDomain: "acme.com", dnsOk: true, sslOk: false, platformOrigin: origin });
    expect(r.targets).toHaveLength(1);
    expect(r.pendingDomain).toBe("acme.com");
  });
  it("has nothing to check without a slug", () => {
    expect(smokeTargets({ slug: "" })).toEqual({ targets: [], pendingDomain: null });
  });
});

describe("labelChecks", () => {
  it("keeps platform paths and prefixes custom-domain paths, surfacing a 404", () => {
    const failed = evaluateSmoke([{ path: "/", status: 404, contentType: "text/html", body: "", ms: 5 }]);
    expect(failed.status).toBe("failed");
    expect(labelChecks("platform", failed)[0]).toMatchObject({ path: "/", ok: false, problem: "HTTP 404" });
    expect(labelChecks("custom_domain", failed)[0]?.path).toBe("custom_domain:/");
  });
});
