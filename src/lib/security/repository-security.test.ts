import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forbiddenEnvFiles = [".env", ".env.development", ".env.production", ".env.test", ".env.local"];

function trackedFiles(paths: string[]): string[] {
  // Local, untracked env files are expected during development; the security
  // boundary we actually care about is that none of them are source-controlled.
  const output = execFileSync("git", ["ls-files", "--", ...paths], { encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

describe("repository security boundary", () => {
  it("never source-controls real environment files", () => {
    expect(trackedFiles(forbiddenEnvFiles)).toEqual([]);
  });

  it("keeps local environment files ignored by git", () => {
    const present = forbiddenEnvFiles.filter(existsSync);
    expect(trackedFiles(present)).toEqual([]);
  });


  it("keeps the committed environment template credential-free", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/sk_(?:live|test)_/);
    expect(example).not.toMatch(/whsec_/);
    expect(example).not.toMatch(/-----BEGIN .*PRIVATE KEY-----/);
    expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
  });
});
