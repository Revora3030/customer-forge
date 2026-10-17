import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_INDEXNOW_KEY, describeIndexNowStatus, indexNowKey, indexNowPayload } from "@/lib/indexnow";

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
      DEFAULT_INDEXNOW_KEY,
    );
    expect(payload).toEqual({
      host: "revoragrowthsystems.com",
      key: DEFAULT_INDEXNOW_KEY,
      keyLocation: "https://revoragrowthsystems.com/indexnow-key.txt",
      urlList: ["https://revoragrowthsystems.com", "https://revoragrowthsystems.com/pricing"],
    });
  });

  it("uses a valid override key and ignores a malformed one", () => {
    expect(indexNowKey("abcdef12-3456")).toBe("abcdef12-3456");
    expect(indexNowKey("bad key!")).toBe(DEFAULT_INDEXNOW_KEY);
    expect(indexNowKey(undefined)).toBe(DEFAULT_INDEXNOW_KEY);
  });

  it("reports acceptance honestly", () => {
    expect(describeIndexNowStatus(202).ok).toBe(true);
    expect(describeIndexNowStatus(403).ok).toBe(false);
  });

  it("serves the key file and keeps the submit action super-admin only", () => {
    expect(readFileSync("src/routes/indexnow-key[.]txt.ts", "utf8")).toContain("indexNowKey(process.env.INDEXNOW_KEY)");
    expect(readFileSync("src/lib/indexnow.functions.ts", "utf8")).toContain("await assertSuperAdmin(context.supabase, context.userId);");
  });
});
