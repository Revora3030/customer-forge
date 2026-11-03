import { describe, expect, it } from "vitest";
import { CLIENT_SITE_CRAWLERS, clientSiteRobotsTxt } from "./client-robots";

describe("client site robots.txt", () => {
  it("allows the AI crawlers and lists only that client's sitemap", () => {
    const rules = clientSiteRobotsTxt({ indexable: true, sitemapUrl: "https://acme.example/sitemap.xml" });
    for (const agent of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bingbot"]) {
      expect(CLIENT_SITE_CRAWLERS).toContain(agent);
      expect(rules).toContain(`User-agent: ${agent}\nAllow: /`);
    }
    expect(rules).toContain("Sitemap: https://acme.example/sitemap.xml");
    expect(rules.match(/Sitemap:/g)).toHaveLength(1);
  });

  it("does not advertise pages when the site is not indexable", () => {
    const rules = clientSiteRobotsTxt({ indexable: false, sitemapUrl: "https://acme.example/sitemap.xml" });
    expect(rules).toContain("User-agent: *\nDisallow: /");
    expect(rules).not.toMatch(/^Allow: \//m);
    expect(rules).not.toContain("Sitemap:");
  });

  it("drops a sitemap value that is not an https URL", () => {
    const rules = clientSiteRobotsTxt({ indexable: true, sitemapUrl: "http://acme.example/sitemap.xml" }); // DevSkim: ignore DS137138 -- Negative fixture: a plaintext sitemap URL must be omitted; nothing is fetched.
    expect(rules).not.toContain("Sitemap:");
  });
});
