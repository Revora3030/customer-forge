/**
 * Lighthouse CI config (Apache-2.0, https://github.com/GoogleChrome/lighthouse-ci).
 *
 * Reports are written to the local filesystem and uploaded as a private
 * Actions artifact. NEVER switch upload.target to "temporary-public-storage":
 * that publishes every report on a public URL.
 *
 * Local CI app pages are gated (SEO and accessibility >= 0.9 error, performance
 * >= 0.8 warn; the CI app is the dev server, so performance is advisory). The
 * live demo draft is audited warn-only because CI has no database.
 */
const LOCAL = "http://127.0.0.1:8080"; // DevSkim: ignore DS162092,DS137138 -- CI-only local app under test.
const DEMO_DRAFT = "https://revoragrowthsystems.com/draft/oak-city-plumbing-test-demo";

module.exports = {
  ci: {
    collect: {
      url: [`${LOCAL}/`, `${LOCAL}/pricing`, `${LOCAL}/contact`, DEMO_DRAFT],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --headless=new",
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: "^http://127\\.0\\.0\\.1:8080/", // DevSkim: ignore DS162092,DS137138 -- CI-only local app under test.
          assertions: {
            "categories:performance": ["warn", { minScore: 0.8 }],
            "categories:seo": ["error", { minScore: 0.9 }],
            "categories:accessibility": ["error", { minScore: 0.9 }],
          },
        },
        {
          matchingUrlPattern: "^https://revoragrowthsystems\\.com/draft/",
          assertions: {
            "categories:performance": ["warn", { minScore: 0.8 }],
            "categories:seo": ["warn", { minScore: 0.9 }],
            "categories:accessibility": ["warn", { minScore: 0.9 }],
          },
        },
      ],
    },
    upload: {
      target: "filesystem",
      outputDir: "./lhci-reports",
    },
  },
};
