import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  baseSecurityHeaders,
} from "@/lib/security-headers";
import { EMBED_PROVIDERS } from "@/lib/site-embed";
import { shareImageFor } from "@/lib/site-head";

describe("security headers match what the product actually does", () => {
  it("lets every allowlisted embed (maps, booking widgets, video) load on live sites", () => {
    const frameSrc = CONTENT_SECURITY_POLICY.split("; ").find((part) =>
      part.startsWith("frame-src"),
    )!;
    for (const host of EMBED_PROVIDERS.flatMap((provider) => provider.hosts))
      expect(frameSrc).toContain(`https://${host}`);
  });
  it("keeps X-Frame-Options in line with frame-ancestors 'self' so the builder preview works", () => {
    expect(baseSecurityHeaders({ https: true })["x-frame-options"]).toBe("SAMEORIGIN");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'self'");
  });
  it("allows this site to use the microphone for builder voice notes, nothing else", () => {
    expect(PERMISSIONS_POLICY).toContain("microphone=(self)");
    expect(PERMISSIONS_POLICY).toContain("camera=()");
  });
});

describe("shared links always carry a picture when the page has one", () => {
  it("prefers the page share image, then the main photo, then the first page picture", () => {
    expect(shareImageFor({ ogImage: "https://a/og.jpg", heroImage: "https://a/h.jpg" })).toBe(
      "https://a/og.jpg",
    );
    expect(shareImageFor({ heroImage: "https://a/h.jpg" })).toBe("https://a/h.jpg");
    expect(
      shareImageFor({
        heroImage: null,
        sections: [
          { components: [{ url: null }, { url: "https://a/first.jpg" }] },
          { components: [{ url: "https://a/2.jpg" }] },
        ],
      }),
    ).toBe("https://a/first.jpg");
  });
  it("never uses a non-https address", () => {
    expect(
      shareImageFor({
        ogImage: "org/path.jpg",
        sections: [{ components: [{ url: "http://x/y.jpg" }] }],
      }),
    ).toBeNull();
  });
  it("is used by every customer-site route", () => {
    for (const route of [
      "src/routes/s.$slug.tsx",
      "src/routes/s.$slug.$page.tsx",
      "src/routes/$.tsx",
    ])
      expect(readFileSync(route, "utf8")).toMatch(/shareImageFor\(/);
  });
});

describe("a build that dies on its last attempt never spins forever", () => {
  it("closes abandoned processing jobs whose attempts are used up and lease expired", () => {
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(worker).toMatch(/async function closeAbandonedJobs/);
    expect(worker).toMatch(/\.gte\("attempts", MAX_ATTEMPTS\)/);
    expect(worker.indexOf("await closeAbandonedJobs(")).toBeLessThan(
      worker.indexOf("const job = await claimJob("),
    );
  });
});
