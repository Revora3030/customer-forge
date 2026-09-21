import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forbiddenEnvFiles = [
  ".env",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.local",
];

/**
 * Every path in git's index, read once as an exact set.
 *
 * Reading the index exactly — rather than asking git to match pathspecs — is
 * what makes this check trustworthy: an empty path list used to make git list
 * the whole repository, which looked like hundreds of leaked files (starting
 * with the harmless `.env.example`) when in fact nothing was tracked at all.
 */
function gitIndex(): Set<string> {
  const output = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Set(output.split("\0").filter(Boolean));
}

function trackedFiles(paths: string[]): string[] {
  // Local, untracked env files are expected during development; the security
  // boundary we actually care about is that none of them are source-controlled.
  const index = gitIndex();
  return paths.filter((path) => index.has(path));
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
