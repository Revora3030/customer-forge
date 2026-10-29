import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Gmail credentials and the mailing address are Lovable secrets. Nothing on the
 * Jarvis page takes them in a form, and no server function stores them in the
 * database; the owner adds them under Settings → Secrets.
 */
describe("Gmail credentials come from Lovable secrets only", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("has no form that accepts them", () => {
    expect(read("src/components/app/jarvis/ProspectInboxCard.tsx")).not.toMatch(/type="password"|clientSecret|refreshToken|<form/);
  });

  it("has no server function that accepts or saves them", () => {
    expect(read("src/lib/prospect-replies.functions.ts")).not.toMatch(/clientSecret|refreshToken|saveGmail|testGmail/);
  });

  it("has no database-backed credential store", () => {
    expect(existsSync("src/lib/gmail/stored-config.server.ts")).toBe(false);
    expect(existsSync("src/lib/gmail/runtime.ts")).toBe(false);
    expect(read("src/lib/gmail/client.server.ts")).not.toMatch(/prospect_autopilot_settings|AsyncLocalStorage/);
  });
});
