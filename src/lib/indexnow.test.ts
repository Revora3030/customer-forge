import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeIndexNowStatus, indexNowKey, indexNowPayload } from "@/lib/indexnow";

const KEY = "example-indexnow-value";

describe("IndexNow submissions for revoragrowthsystems.com", () => {
  it("only sends pages on Revora's own host, once each, with the published key file", () => {
    const payload = indexNowPayload(
      "https://revoragrowthsystems.com",
      [
        "https://revoragrowthsystems.com",
        "https://revoragrowthsystems.com/pricing",
        "https://revoragrowthsystems.com/pricing",
        "https://evil.example/pricing",
        "not a url",
      ],
      KEY,
    );
    expect(payload).toEqual({
      host: "revoragrowthsystems.com",
      key: KEY,
      keyLocation: "https://revoragrowthsystems.com/indexnow-key.txt",
      urlList: ["https://revoragrowthsystems.com", "https://revoragrowthsystems.com/pricing"],
    });
  });

  it("derives a stable key per host and honours a valid override", async () => {
    const derived = await indexNowKey("revoragrowthsystems.com");
    expect(derived).toMatch(/^[0-9a-f]{32}$/);
    expect(await indexNowKey("RevoraGrowthSystems.com")).toBe(derived);
    expect(await indexNowKey("other.example")).not.toBe(derived);
    expect(await indexNowKey("revoragrowthsystems.com", "abcdef12-3456")).toBe("abcdef12-3456");
    expect(await indexNowKey("revoragrowthsystems.com", "bad key!")).toBe(derived);
  });

  it("reports acceptance honestly", () => {
    expect(describeIndexNowStatus(202).ok).toBe(true);
    expect(describeIndexNowStatus(403).ok).toBe(false);
  });

  it("serves the key file and keeps the submit action super-admin only", () => {
    expect(readFileSync("src/routes/indexnow-key[.]txt.ts", "utf8")).toContain('await indexNowKey(host, process.env["INDEXNOW_KEY"])');
    expect(readFileSync("src/lib/indexnow.functions.ts", "utf8")).toContain("await assertSuperAdmin(context.supabase, context.userId);");
  });
});
