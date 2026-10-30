#!/usr/bin/env bun
/**
 * Post-deploy IndexNow ping for revoragrowthsystems.com.
 *
 *   bun scripts/indexnow-ping.ts            # read live sitemap, submit to IndexNow
 *   bun scripts/indexnow-ping.ts --dry-run  # print the payload, send nothing
 *   bun scripts/indexnow-ping.ts --origin=https://revoragrowthsystems.com
 *
 * Reads the live /sitemap.xml (following a sitemap index if there is one),
 * keeps only URLs on the origin's host, fetches the published key from
 * /indexnow-key.txt and checks it is also served at /<key>.txt, then POSTs
 * { host, key, keyLocation, urlList } to https://api.indexnow.org/indexnow.
 * IndexNow is free and needs no account or secret; the key is public by design.
 * Exit code is 0 only when IndexNow answers 200 or 202 (or on a clean dry run).
 */
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY_PATH, describeIndexNowStatus, indexNowPayload, indexNowRootKeyPath, sitemapLocs } from "../src/lib/indexnow";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const origin = (args.find((arg) => arg.startsWith("--origin="))?.slice("--origin=".length) ?? "https://revoragrowthsystems.com").replace(/\/+$/, "");
const UA = "RevoraIndexNowPing/1.0 (+https://revoragrowthsystems.com)";

async function getText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return response.text();
}

async function collectUrls(sitemapUrl: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.has(sitemapUrl) || seen.size > 50) return [];
  seen.add(sitemapUrl);
  const { urls, sitemaps } = sitemapLocs(await getText(sitemapUrl));
  const host = new URL(origin).host;
  const nested = sitemaps.filter((loc) => new URL(loc).host === host);
  for (const child of nested) urls.push(...(await collectUrls(child, seen)));
  return urls;
}

async function main() {
  const key = (await getText(`${origin}${INDEXNOW_KEY_PATH}`)).trim();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error(`${origin}${INDEXNOW_KEY_PATH} did not return a valid IndexNow key`);
  try {
    const root = (await getText(`${origin}${indexNowRootKeyPath(key)}`)).trim();
    console.log(root === key ? `Root key file OK: ${origin}${indexNowRootKeyPath(key)}` : `Warning: root key file content does not match`);
  } catch (error) {
    console.log(`Note: root key file not live yet (${(error as Error).message}); keyLocation ${INDEXNOW_KEY_PATH} is used.`);
  }

  const payload = indexNowPayload(origin, await collectUrls(`${origin}/sitemap.xml`), key);
  console.log(`host=${payload.host} keyLocation=${payload.keyLocation} urls=${payload.urlList.length}`);
  if (!payload.urlList.length) throw new Error("The live sitemap had no URLs on this host; nothing submitted.");
  if (dryRun) {
    console.log(JSON.stringify({ ...payload, urlList: payload.urlList.slice(0, 5).concat(payload.urlList.length > 5 ? ["…"] : []) }, null, 2));
    console.log("Dry run: nothing sent.");
    return;
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "user-agent": UA },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const status = describeIndexNowStatus(response.status);
  console.log(`IndexNow ${response.status}: ${status.message}`);
  if (!status.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`IndexNow ping failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
