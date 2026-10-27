/**
 * Visit counts should be people. Crawlers, uptime monitors, link-preview
 * fetchers and speed-test tools run the site's script and would otherwise be
 * recorded as visitors and as real-user speed. Only a user agent that names
 * itself automation is dropped; a missing or ordinary one is always counted,
 * so a real visit is never lost to a guess.
 */
const AUTOMATED_AGENT = new RegExp(
  [
    // Self-declared bots ("Googlebot", "bingbot", "AhrefsBot"); Cubot is a phone brand.
    "\\b(?!cubot)[a-z0-9._-]*bot\\b",
    "crawl", "spider", "slurp", "scraper", "scrapy",
    // Headless browsers and automation drivers.
    "headless", "phantomjs", "playwright", "puppeteer", "selenium", "webdriver",
    // Speed and monitoring tools.
    "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptimerobot", "statuscake", "site24x7", "monitor",
    // Link-preview and feed fetchers.
    "facebookexternalhit", "whatsapp", "slackbot", "discordbot", "embedly", "linkpreview", "feedfetcher", "bingpreview",
    "google-read-aloud", "mediapartners", "adsbot",
    // Plain HTTP clients.
    "curl/", "wget/", "python-requests", "python-urllib", "aiohttp", "go-http-client", "okhttp/", "node-fetch", "axios/", "undici", "libwww", "java/",
  ].join("|"),
  "i",
);

export function isAutomatedUserAgent(userAgent: string | null | undefined): boolean {
  const agent = userAgent?.trim();
  return agent ? AUTOMATED_AGENT.test(agent) : false;
}
