import { describe, expect, it } from "vitest";
import { isAutomatedUserAgent } from "./automated-traffic";

const REAL = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; CUBOT P80) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

const AUTOMATED = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
  "curl/8.5.0",
  "python-requests/2.32.3",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
];

describe("isAutomatedUserAgent", () => {
  it("counts ordinary browsers, including a phone brand that contains 'bot'", () => {
    for (const agent of REAL) expect(isAutomatedUserAgent(agent), agent).toBe(false);
  });

  it("drops agents that identify themselves as automation", () => {
    for (const agent of AUTOMATED) expect(isAutomatedUserAgent(agent), agent).toBe(true);
  });

  it("never drops a visit just because the agent is missing", () => {
    expect(isAutomatedUserAgent(null)).toBe(false);
    expect(isAutomatedUserAgent(undefined)).toBe(false);
    expect(isAutomatedUserAgent("   ")).toBe(false);
  });
});
