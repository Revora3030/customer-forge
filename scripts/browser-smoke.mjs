import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.BROWSER_QA_BASE_URL || "http://127.0.0.1:8080";
const routes = (process.env.BROWSER_QA_ROUTES || "/")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean)
  .slice(0, 12);

mkdirSync("browser-qa-artifacts", { recursive: true });

function run(args) {
  return execFileSync("playwright-cli", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  });
}

const report = [];

for (const route of routes) {
  const url = new URL(route, baseUrl).toString();
  const name = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

  try {
    const opened = run(["open", url]);
    const snapshot = run(["--raw", "snapshot", "--depth=6"]);

    // Viewport screenshots are intentionally used instead of full-page capture.
    // Full-page capture can hang on unbounded/infinite-scroll generated pages and
    // should never make the release gate flaky.
    run(["resize", "1440", "1000"]);
    run(["screenshot", "--hires", "--filename=browser-qa-artifacts/" + name + "-desktop.png"]);

    run(["resize", "390", "844"]);
    run(["screenshot", "--hires", "--filename=browser-qa-artifacts/" + name + "-mobile.png"]);

    // Restore a desktop viewport for subsequent routes.
    run(["resize", "1440", "1000"]);

    report.push({
      route,
      url,
      passed: true,
      snapshot: snapshot.slice(0, 12000),
      opened: opened.slice(0, 2000),
      screenshots: ["desktop", "mobile"],
    });

    run(["close"]);
  } catch (error) {
    report.push({ route, url, passed: false, error: String(error) });
    try {
      run(["close"]);
    } catch {
      // Best-effort session cleanup; the original failure remains authoritative.
    }
  }
}

const failed = report.filter((x) => !x.passed);
writeFileSync(
  "browser-qa-artifacts/report.json",
  JSON.stringify({ baseUrl, routes, failed: failed.length, report }, null, 2),
);

if (failed.length) process.exit(1);
