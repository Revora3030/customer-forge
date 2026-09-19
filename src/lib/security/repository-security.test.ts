import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forbiddenEnvFiles = [".env", ".env.development", ".env.production", ".env.test", ".env.local"];

describe("repository security boundary", () => {
  it("does not contain real environment files", () => {
    expect(forbiddenEnvFiles.filter(existsSync)).toEqual([]);
  });

  it("keeps the committed environment template credential-free", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/sk_(?:live|test)_/);
    expect(example).not.toMatch(/whsec_/);
    expect(example).not.toMatch(/-----BEGIN .*PRIVATE KEY-----/);
    expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
  });
});
